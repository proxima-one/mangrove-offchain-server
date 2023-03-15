import * as prisma from "@prisma/client";
import { AccountId, KandelId, KandelVersionId, MangroveId, OfferId, OfferListingId, ReserveId, StratId, TokenId } from "../model";
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
          reserveId?: ReserveId
          mangroveId: MangroveId,
          base: TokenId,
          quote: TokenId,
          type: "AaveKandel" | "Kandel"
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
          if( !params.constParams?.type){
            throw new Error( `Can't create Kandel without a type, id:${params.id.value}`);
          }
          if( params.constParams?.type == "AaveKandel" && !params.constParams?.reserveId?.value){
            throw new Error( `Can't create Kandel without an reserveId, id:${params.id.value}`);
          }
          const newVersionId = new KandelVersionId({ kandelId: params.id, versionNumber: 0 });
          kandel = {
              id: params.id.value,
              mangroveId: params.constParams.mangroveId.value,
              stratId: new StratId(params.constParams.mangroveId.chainId, params.id.address).value,
              baseId: params.constParams.base.value,
              quoteId: params.constParams.quote.value,
              reserveId: params.constParams.reserveId?.value ?? new ReserveId(params.constParams.mangroveId.chainId, params.id.address).value,
              accountId: new AccountId(params.constParams.mangroveId.chainId, params.id.address).value,
              currentVersionId: newVersionId.value,
              type: params.constParams.type
            };
          newVersion= {
              id: newVersionId.value,
              kandelId: params.id.value,
              txId: params.txId,
              reserveVersionId:"",
              congigurationId:"",
              adminId:"",
              routerAddress:"",
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
        const reserveAddress = await this.getReserveAddress(id);
        
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
        await this.deleteReserveVersionIfNotUsed(new ReserveId(id.chainId, reserveAddress));
        await this.deleteKandelConfigIfNotUsed(kandelVersion!.congigurationId)
      }

  async deleteReserveVersionIfNotUsed(id:ReserveId){
    const reserveVersions = await this.tx.reserveVersion.findMany({where: { id: id.value}})
    if( reserveVersions.length == 0) {
      await this.reserveOperations.deleteLatestReserveVersion(id);
      return true;
    }
    return false;
  }

  async deleteKandelConfigIfNotUsed(id:string){
    const kandels = await this.tx.kandelVersion.findMany({where: { congigurationId: id}})
    if( kandels.length == 0) {
      await this.tx.kandelConfiguration.delete({where:{id:id}});
      return true;
    }
    return false;
    
  }

  async getReserveAddress(kandelId:KandelId){
    const kandel = await this.getKandel(kandelId);
    const reserve = await this.tx.reserve.findUnique({where: {id: kandel.reserveId}})
    if(!reserve) {
      throw new Error(`Cannot find reserve from kandel id: ${kandelId.value}, with reserveId: ${kandel.reserveId}`)
    }
    const account = await this.tx.account.findUnique({where: {id: reserve.accountId}})
    if(!account) {
      throw new Error(`Cannot find reserve account from kandel id: ${kandelId.value}, reserveId: ${kandel.reserveId} and accountId: ${reserve.accountId}`)
    }
    return account.address;
  }


  async getToken(kandelId:KandelId, baseOrQuote: "baseId"|"quoteId"){
    const kandel = await this.getKandel(kandelId);
    const token = await this.tx.token.findUnique({where: {id: kandel[baseOrQuote]}})
    if(!token){
      throw new Error(`Cannot find base token from kandelId: ${kandelId.value}, with ${baseOrQuote}: ${kandel[baseOrQuote]}`)
    }
    return token;
  }

  async getKandel(kandelId:KandelId){
    const kandel = await this.tx.kandel.findUniqueOrThrow({where: {id: kandelId.value}});
    if(!kandel){
      throw new Error(`Cannot find kandel instance from kandel id: ${kandelId.value}`)
    }
    return kandel;
  }

  async createOfferIndex(kandelId: KandelId, txId:string, offerId:OfferId, index:number, ba:"ask"|"bid") {
    await this.tx.kandelOfferIndex.create({
      data: {
        kandelId: kandelId.value,
        txId: txId,
        offerId: offerId.value,
        index: index,
        ba: ba
    }})
  }

  async deleteOfferIndex(kandelId: KandelId, offerId:OfferId, ba:"ask"|"bid"){
    await this.tx.kandelOfferIndex.delete({where: {
      offerId_kandelId_ba: {
        kandelId: kandelId.value,
        offerId: offerId.value,
        ba:ba
      }
    }})
  }

}