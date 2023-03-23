import * as prisma from "@prisma/client";
import _ from "lodash";
import { AccountId, KandelId, TakenOfferId, TokenBalanceId, TokenBalanceVersionId, TokenId } from "../model";
import { DbOperations, toNewVersionUpsert } from "./dbOperations";
import { KandelOperations } from "./kandelOperations";


export class TokenBalanceOperations extends DbOperations {

  kandelOperations= new KandelOperations(this.tx);

  

  public async addTokenBalanceVersion(params: {
    tokenBalanceId: TokenBalanceId,
    txId: string,
    updateFunc?: (model: Omit<prisma.TokenBalanceVersion, "id" | "tokenBalanceId" | "versionNumber" | "prevVersionId">) => void,
  }) {
    let reserve: prisma.Account | null = await this.tx.account.findUnique({
      where: { id: "accountId" in params.tokenBalanceId.params ? params.tokenBalanceId.params.accountId.value: params.tokenBalanceId.params.account.id },
    });

    let tokenBalance: prisma.TokenBalance | null = await this.tx.tokenBalance.findUnique({
      where: {
        id: params.tokenBalanceId.value
      }
    })

    let newTokenBalanceVersion: prisma.TokenBalanceVersion | undefined = undefined;

    if (reserve === null) {
      if("accountId" in params.tokenBalanceId.params) {
        reserve = {
          id: params.tokenBalanceId.params.accountId.value,
          chainId: params.tokenBalanceId.params.accountId.chainId.value,
          address: params.tokenBalanceId.params.accountId.address
        };
      } else {
        reserve = {
          id: params.tokenBalanceId.params.account.id,
          chainId: params.tokenBalanceId.params.account.chainId,
          address: params.tokenBalanceId.params.account.address
        };
      }

     reserve = await this.tx.account.create( { data: {...reserve } }    );
    }

    if( tokenBalance === null ){
      const newVersionId = new TokenBalanceVersionId({ tokenBalanceId: params.tokenBalanceId, versionNumber: 0 });

      tokenBalance = {
        id: params.tokenBalanceId.value,
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



    const updatedOrNewTokenBalance= await this.tx.tokenBalance.upsert(
      toNewVersionUpsert( tokenBalance, newTokenBalanceVersion.id)
    );

    const newVersion = await this.tx.tokenBalanceVersion.create({ data: newTokenBalanceVersion });
    return {updatedOrNewTokenBalance, newVersion}
  }

  async getTokenBalanceFromKandel(kandelId:KandelId, tokenId: TokenId){
    const kandel = await this.kandelOperations.getKandel(kandelId);
    const reserve =await this.tx.account.findUnique({where: {
      id: kandel.reserveId
    }})
    if( !reserve){
      throw new Error(`Cannot find reserve on kandel: ${kandel.id}, with reserveId: ${kandel.reserveId}`);
    }

    const tokenBalance = await this.tx.tokenBalance.findUnique({where: {
      id: new TokenBalanceId({account:reserve, tokenId}).value
    }})
    if(!tokenBalance){
      throw new Error(`Cannot find tokenBalance from reserveId: ${reserve.id} and tokenId: ${tokenId.value}`)
    }
    return await this.getCurrentTokenBalanceVersion(tokenBalance);
  }

  async getCurrentTokenBalanceVersion(tokenBalance: prisma.TokenBalance): Promise<prisma.TokenBalanceVersion> {
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

  async createTokenBalanceEvent(reserveId:AccountId, kandelId: KandelId|prisma.Kandel, tokenId: TokenId, tokenBalanceVersion:prisma.TokenBalanceVersion, takenOfferId?: TakenOfferId){
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