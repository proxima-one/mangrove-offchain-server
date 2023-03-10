import * as prisma from "@prisma/client";
import { KandelId, KandelVersionId, OfferListingId, StratId } from "../model";
import { DbOperations, toUpsert } from "./dbOperations";
import _ from "lodash";
import { ReserveOperations } from "./reserveOperations";
import { KandelParams } from "../handlers/stratsHandler/kandelEventsLogic";


export class KandelOperations extends DbOperations {

  reserveOperations = new ReserveOperations(this.tx);

    public async addVersionedKandel(params:{
        id: KandelId,
        txId: string,
        updateFunc?: (model: Omit< prisma.KandelVersion, "id" | "kandelId" | "versionNumber" | "prevVersionId">) => void,
        constParams?: {
          reserveId?: string
        }
      }) {
        let kandel: prisma.Kandel | null = await this.tx.kandel.findUnique({
          where: { id: params.id.value },
        });
    
        if(kandel && !params.updateFunc){
          throw new Error( `You are trying to create a new version of an existing Kandel ${kandel.id}, but gave no updateFunction`)
        }
        
        let newVersion: prisma.KandelVersion;
    
        if( kandel === null){
          if(!params.constParams?.reserveId){
            throw new Error( `Can't create Kandel without an reserveId, id:${params.id.value}`);
          }
          const newVersionId = new KandelVersionId({ kandelId: params.id, versionNumber: 0 });
          kandel = {
              id: params.id.value,
              mangroveId: params.id.mangroveId.value,
              stratId: new StratId(params.id.mangroveId.chainId, params.id.reserveId.address).value,
              offerListingId: new OfferListingId(params.id.mangroveId, params.id.offerListKey).value,
              reserveId: params.constParams.reserveId,
              accountId: params.id.reserveId.value,
              proximaId: params.id.proximaId,
              currentVersionId: newVersionId.value,
            };
          newVersion= {
              id: newVersionId.value,
              kandelId: params.id.value,
              txId: params.txId,
              reserveVersionId:"",
              congigurationId:"",
              trigger: "NewKandel",
              versionNumber: 0,
              prevVersionId: null
            };
        } else {
              const oldVersion = await this.getCurrentKandelVersion(kandel);
              const newVersionNumber = oldVersion.versionNumber + 1;
              const newVersionId = new KandelVersionId({ kandelId: params.id, versionNumber:  newVersionNumber });
              newVersion = _.merge(oldVersion, {
                id: newVersionId.value,
                txId: params.txId,
                versionNumber: newVersionNumber,
                prevVersionId: oldVersion.id,
              });
    
        }
        if( params.updateFunc){
          params.updateFunc(newVersion);
        }
    
        await this.tx.kandel.upsert(
          toUpsert(
            _.merge(kandel, {
              currentVersionId: newVersion.id,
            })
          )
        );
    
        await this.tx.kandelVersion.create({ data: newVersion });
      }
    
    async createNewKandelConfiguration(configuration:KandelParams) {
      return await this.tx.kandelConfiguration.create({ data: {...configuration}})
    }

    async getCurrentReserveVersion(idOrKandel: KandelId | prisma.Kandel): Promise<prisma.ReserveVersion> {
      const id = this.getId(idOrKandel);
      const kandel = await this.tx.kandel.findUnique({where: { id: id}})
      if(!kandel){
        throw new Error(`Could not find kandel from id: ${id}`);
      }
      const reserve = await this.tx.reserve.findUnique({
        where: { id: kandel.reserveId },
      });
      if (reserve === null) {
        throw new Error(`Reserve not found on kandleId: ${kandel.id}, reserveId: ${kandel.reserveId}`);
      }
      return await this.reserveOperations.getCurrentReserveVersion(reserve)   
    }


    async getCurrentKandelVersion(idOrKandel: KandelId | prisma.Kandel): Promise<prisma.KandelVersion> {
        const id = this.getId(idOrKandel);
        const kandel = await this.tx.kandel.findUnique({where: { id: id}})
        if(!kandel){
          throw new Error(`Could not find kandel from id: ${id}`);
        }
        const currentVersion = await this.tx.kandelVersion.findUnique({
          where: { id: kandel.currentVersionId },
        });
        if (currentVersion === null) {
          throw new Error(`Current KandelVersion not found, currentVersionId: ${kandel.currentVersionId}`);
        }
        return currentVersion;
      }
    
    getId(idOrKandel: KandelId | prisma.Kandel  ) {
        return "id" in idOrKandel ? idOrKandel.id : (idOrKandel as KandelId).value;
      }

    public async deleteLatestKandelVersion(id: KandelId) {
        const kandel = await this.tx.kandel.findUnique({
          where: { id: id.value },
        });
        if (kandel === null) {
          throw Error(`Kandel not found - id: ${id}`);
        }
    
        const kandelVersion = await this.tx.kandelVersion.findUnique({
          where: { id: kandel.currentVersionId },
        });
        
        
        if (kandelVersion!.prevVersionId === null) {
          await this.tx.kandel.update({
            where: { id: id.value },
            data: { 
              currentVersionId: "",
             }, 
          });
          await this.tx.kandelVersion.delete({
            where: { id: kandel.currentVersionId },
          });
          await this.tx.kandel.delete({ where: { id: id.value } });
        } else {
          await this.tx.kandel.update({
            where: { id: id.value },
            data: { 
              currentVersionId: kandelVersion!.prevVersionId,
             }, 
          });
          await this.tx.kandelVersion.delete({
            where: { id: kandel.currentVersionId },
          });
        }
        
    
      }

}