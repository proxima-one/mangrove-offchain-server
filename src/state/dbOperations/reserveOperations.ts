import * as prisma from "@prisma/client";
import _ from "lodash";
import { ReserveVersionId, ReserveId, TokenId, AccountId } from "../model";
import { DbOperations, toUpsert } from "./dbOperations";


export class ReserveOperations extends DbOperations {

  public async addVersionedReserve(params: {
    id: ReserveId,
    txId: string,
    updateFunc?: (model: Omit<prisma.ReserveVersion, "id" | "reserveId" | "versionNumber" | "prevVersionId">) => void,
    address?: string,
  }) {
    let reserve: prisma.Reserve | null = await this.tx.reserve.findUnique({
      where: { id: params.id.value },
    });

    if (reserve && !params.updateFunc) {
      throw new Error(`You are trying to create a new version of an existing Reserve ${reserve.id}, but gave no updateFunction`)
    }

    let account: prisma.Account | undefined =undefined;

    let newReserveVersion: prisma.ReserveVersion;

    if (reserve === null) {
      if (!params.address) {
        throw new Error(`Can't create Reserve without an address, id:${params.id.value}`);
      }
      const newVersionId = new ReserveVersionId({ reserveId: params.id, versionNumber: 0 });
      const accountId = new AccountId(params.id.chainId, params.address).value;
      reserve = {
        id: params.id.value,
        accountId: accountId,
        currentVersionId: newVersionId.value,
      };
      account = {
        id:accountId,
        chainId: params.id.chainId.value,
        address: params.address
      }
      
      newReserveVersion = {
        id: newVersionId.value,
        reserveId: params.id.value,
        txId: params.txId,
        versionNumber: 0,
        prevVersionId: null
      };
    } else {
      const oldVersion = await this.getCurrentReserveVersion(reserve);
      const newReserveVersionNumber = oldVersion.versionNumber + 1;
      const newReserveVersionId = new ReserveVersionId({ reserveId: params.id, versionNumber: newReserveVersionNumber });
      newReserveVersion = _.merge(oldVersion, {
        id: newReserveVersionId.value,
        txId: params.txId,
        versionNumber: newReserveVersionNumber,
        prevVersionId: oldVersion.id,
      });

    }
    if (params.updateFunc) {
      params.updateFunc(newReserveVersion);
    }

    if( account) {
      await this.tx.account.upsert(
        toUpsert(account)
      )
    }

    await this.tx.reserve.upsert(
      toUpsert(
        _.merge(reserve, {
          currentVersionId: newReserveVersion.id,
        })
      )
    );

    return await this.tx.reserveVersion.create({ data: newReserveVersion });
  }


  async getCurrentReserveVersion(idOrReserve: ReserveId | prisma.Reserve): Promise<prisma.ReserveVersion> {
    const id = this.getId(idOrReserve);
    const reserve = await this.tx.reserve.findUnique({ where: { id: id } })
    if (!reserve) {
      throw new Error(`Could not find reserve from id: ${id}`);
    }
    const currentReserveVersion = await this.tx.reserveVersion.findUnique({
      where: { id: reserve.currentVersionId },
    });
    if (currentReserveVersion === null) {
      throw new Error(`Current ReserveVersion not found, currentReserveVersionId: ${reserve.currentVersionId}, on Reserve id : ${reserve.id}`);
    }
    return currentReserveVersion;
  }

  getId(idOrReserve: ReserveId | prisma.Reserve) {
    return "id" in idOrReserve ? idOrReserve.id : (idOrReserve as ReserveId).value;
  }

  getReserveVersionId(idOrReserveVersion: ReserveVersionId | prisma.ReserveVersion) {
    return "id" in idOrReserveVersion ? idOrReserveVersion.id : (idOrReserveVersion as ReserveVersionId).value;
  }


  async getDepositWithdrawalStatusForToken(idOrReserveVersion: ReserveVersionId | prisma.ReserveVersion, tokenId: TokenId):Promise<prisma.DepositWithdrawalStatus> {
    const id = this.getReserveVersionId(idOrReserveVersion);
    const reserveVersion = await this.tx.reserveVersion.findUnique({
      where: {
        id: id
      }
    })
    if (!reserveVersion) {
      throw new Error(`Could not find a ReserveVersion from reserveVersionId: ${id}, and tokenId: ${tokenId.value}`)
    }
    const relation = await this.tx.reserveVersion_Status_Relation.findUnique({ where: { reserveVersionId: reserveVersion.id, tokenId: tokenId.value } });
    if(!relation){
      throw new Error(`Could not find a relation between tokenId: ${tokenId.value} and reserveVersionId: ${reserveVersion.id}`);
    }
    const status = await this.tx.depositWithdrawalStatus.findUnique({ where: { id: relation.statusId} })
    if(!status ){
      throw new Error(`Could not find a DepositWithdrawalStatus for statusId: ${relation.statusId}`);
    }

    return status;
  }


  public async deleteLatestReserveVersion(id: ReserveId) {
    const reserve = await this.tx.reserve.findUnique({
      where: { id: id.value },
    });
    if (reserve === null) {
      throw Error(`Reserve not found - id: ${id}`);
    }

    const reserveVersion = await this.tx.reserveVersion.findUnique({
      where: { id: reserve.currentVersionId },
    });


    if (reserveVersion!.prevVersionId === null) {
      await this.tx.reserve.update({
        where: { id: id.value },
        data: {
          currentVersionId: "",
        },
      });
      await this.tx.reserveVersion.delete({
        where: { id: reserve.currentVersionId },
      });
      await this.tx.reserve.delete({ where: { id: id.value } });
    } else {
      await this.tx.reserve.update({
        where: { id: id.value },
        data: {
          currentVersionId: reserveVersion!.prevVersionId,
        },
      });
      await this.tx.reserveVersion.delete({
        where: { id: reserve.currentVersionId },
      });
    }


  }

}