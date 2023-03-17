import * as prisma from "@prisma/client";
import _, { add } from "lodash";
import { ReserveId, TokenId, AccountId, TokenBalanceId, TokenBalanceVersionId, KandelId, TakenOfferId } from "../model";
import { DbOperations, toUpsert } from "./dbOperations";
import { KandelOperations } from "./kandelOperations";


export class TokenBalanceOperations extends DbOperations {

  kandelOperations= new KandelOperations(this.tx);

  

  public async addTokenBalanceVersion(params: {
    reserveId: ReserveId,
    tokenBalanceId: TokenBalanceId,
    txId: string,
    updateFunc: (model: Omit<prisma.TokenBalanceVersion, "id" | "tokenBalanceId" | "versionNumber" | "prevVersionId">) => void,
    reserveAddress?: string,
  }) {
    let reserve: prisma.Reserve | null = await this.tx.reserve.findUnique({
      where: { id: params.reserveId.value },
    });

    let tokenBalance: prisma.TokenBalance | null = await this.tx.tokenBalance.findUnique({
      where: {
        id: params.tokenBalanceId.value
      }
    })

    let account: prisma.Account | undefined = undefined;

    let newTokenBalanceVersion: prisma.TokenBalanceVersion | undefined = undefined;

    

    if (reserve === null) {
      if (!params.reserveAddress) {
        throw new Error(`Can't create Reserve without an address, reserveId:${params.reserveId.value}`);
      }
      const accountId = new AccountId(params.reserveId.chainId, params.reserveAddress).value;
      reserve = {
        id: params.reserveId.value,
        accountId: accountId,
      };
      account = {
        id: accountId,
        chainId: params.reserveId.chainId.value,
        address: params.reserveAddress
      }

    }

    if( tokenBalance === null ){
      const newVersionId = new TokenBalanceVersionId({ tokenBalanceId: params.tokenBalanceId, versionNumber: 0 });

      tokenBalance = {
        id: newVersionId.value,
        txId: params.txId,
        reserveId: reserve.id,
        tokenId: params.tokenBalanceId.params.tokenId.value,
        currentVersionId: newVersionId.value
      }      

      newTokenBalanceVersion = {
        id: newVersionId.value,
        txId: params.txId,
        tokenBalanceId: tokenBalance.id,
        deposit: "0",
        withdrawal: "0",
        spent: "0",
        earned: "0",
        balance: "0",
        versionNumber: 0,
        prevVersionId: null
      }


    } else {
      const oldVersion = await this.getCurrentTokenBalanceVersion(tokenBalance);
      const newTokenBalanceVersionNumber = oldVersion.versionNumber + 1;
      const newTokenBalanceVersionId = new TokenBalanceVersionId({ tokenBalanceId: params.tokenBalanceId, versionNumber: newTokenBalanceVersionNumber });
      newTokenBalanceVersion = _.merge(oldVersion, {
        id: newTokenBalanceVersionId.value,
        txId: params.txId,
        versionNumber: newTokenBalanceVersionNumber,
        prevVersionId: oldVersion.id,
      });

    }
    if (params.updateFunc) {
      params.updateFunc(newTokenBalanceVersion);
    }

    if (account) {
      await this.tx.account.upsert(
        toUpsert(account)
      )
    }

    await this.tx.reserve.upsert(
      toUpsert(
        reserve
      )
    );

    await this.tx.tokenBalance.upsert(
      toUpsert( tokenBalance)
    );

    return await this.tx.tokenBalanceVersion.create({ data: newTokenBalanceVersion });
  }

  async getTokenBalanceFromKandel(kandelId:KandelId, tokenId: TokenId){
    const kandel = await this.kandelOperations.getKandel(kandelId);
    const reserve =await this.tx.reserve.findUnique({where: {
      id: kandel.reserveId
    }})
    if( !reserve){
      throw new Error(`Cannot find reserve on kandel: ${kandel.id}, with reserveId: ${kandel.reserveId}`);
    }

      const tokenBalance = await this.tx.tokenBalance.findUnique({where: {
        reserveId: reserve.id,
        tokenId: tokenId.value
      }})
      if(!tokenBalance){
        throw new Error(`Cannot find tokenBalance from reserveId: ${reserve.id} and tokenId: ${tokenId.value}`)
      }
      return await this.getCurrentTokenBalanceVersion(tokenBalance);
  }

  async getCurrentTokenBalanceVersion(idOrTokenBalance: TokenBalanceId | prisma.TokenBalance): Promise<prisma.TokenBalanceVersion> {
    const id = this.getTokenBalanceId(idOrTokenBalance);
    const tokenBalance = await this.tx.tokenBalance.findUnique({ where: { id: id } })
    if (!tokenBalance) {
      throw new Error(`Could not find tokenBalance from id: ${id}`);
    }
    const currentTokenBalanceVersion = await this.tx.tokenBalanceVersion.findUnique({
      where: { id: tokenBalance.currentVersionId },
    });
    if (currentTokenBalanceVersion === null) {
      throw new Error(`Current TokenBalanceVersion not found, currentTokenBalanceVersionId: ${tokenBalance.currentVersionId}, on TokenBalance id : ${tokenBalance.id}`);
    }
    return currentTokenBalanceVersion;
  }

  getTokenBalanceId(idOrTokenBalance: TokenBalanceId | prisma.TokenBalance) {
    return "id" in idOrTokenBalance ? idOrTokenBalance.id : (idOrTokenBalance as TokenBalanceId).value;
  }





  public async deleteLatestTokenBalanceVersion(id: TokenBalanceId) {
    const tokenBalance = await this.tx.tokenBalance.findUnique({
      where: { id: id.value },
    });
    if (tokenBalance === null) {
      throw Error(`TokenBalance not found - id: ${id}`);
    }

    const tokenBalanceVersion = await this.tx.tokenBalanceVersion.findUnique({
      where: { id: tokenBalance.currentVersionId },
    });


    if (tokenBalanceVersion!.prevVersionId === null) {
      await this.tx.tokenBalance.update({
        where: { id: id.value },
        data: {
          currentVersionId: "",
        },
      });
      await this.tx.tokenBalanceVersion.delete({
        where: { id: tokenBalance.currentVersionId },
      });
      await this.tx.tokenBalance.delete({ where: { id: id.value } });
    } else {
      await this.tx.tokenBalance.update({
        where: { id: id.value },
        data: {
          currentVersionId: tokenBalanceVersion!.prevVersionId,
        },
      });
      await this.tx.tokenBalanceVersion.delete({
        where: { id: tokenBalance.currentVersionId },
      });
    }
  }

  async createTokenBalanceEvent(reserveId:ReserveId, kandelId: KandelId|prisma.Kandel, tokenId: TokenId, tokenBalanceVersion:prisma.TokenBalanceVersion, takenOfferId?: TakenOfferId){
    return await this.tx.tokenBalanceEvent.create({data: {
      reserveId: reserveId.value,
      kandelId: "value" in kandelId ?  kandelId.value :kandelId.id,
      tokenId: tokenId.value,
      tokenBalanceVersionId: tokenBalanceVersion.id,
      takenOfferId: takenOfferId?.value
    }})
  }

  async createTokenBalanceDepositEvent(tokenBalanceEvent: prisma.TokenBalanceEvent, value: string, source:prisma.TokenBalanceEventSource ){
    return await this.tx.tokenBalanceDepositEvent.create({data: {
      tokenBalanceEventId: tokenBalanceEvent.id,
      source: source,
      value: value
    }})
  }

  async createTokenBalanceWithdrawalEvent(tokenBalanceEvent: prisma.TokenBalanceEvent, value: string, source:prisma.TokenBalanceEventSource ){
    return await this.tx.tokenBalanceWithdrawalEvent.create({data: {
      tokenBalanceEventId: tokenBalanceEvent.id,
      source: source,
      value: value
    }})
  }

}