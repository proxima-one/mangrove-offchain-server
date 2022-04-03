import * as prisma from "@prisma/client";
import * as _ from "lodash";
import {
  PrismaStateTransitionHandler,
  PrismaTransaction,
  TypedEvent,
} from "../../common";

import * as ft from "@proximaone/stream-schema-fungible-token";
import { ChainId, TokenId } from "../model";

export class TokenEventHandler extends PrismaStateTransitionHandler<ft.streams.NewFungibleTokenStreamEvent> {
  protected async handleEvents(
    events: TypedEvent<ft.streams.NewFungibleTokenStreamEvent>[],
    tx: PrismaTransaction
  ): Promise<void> {
    const commands: prisma.PrismaPromise<any>[] = [];

    // load
    const affectedTokensIds = _.uniq(
      events.map((x) => this.getTokenId(x.payload).value)
    );
    const tokens = await tx.token.findMany({
      where: { id: { in: affectedTokensIds } },
    });
    const tokensLookup: Record<string, prisma.Token> = {};
    for (const token of tokens) tokensLookup[token.id] = token;

    // handle
    for (const { undo, timestamp, payload } of events) {
      const tokenId = this.getTokenId(payload);
      if (undo) {
        if (tokensLookup[tokenId.value])
          commands.push(
            tx.token.delete({
              where: { id: tokenId.value },
            })
          );
      } else {
        if (!tokensLookup[tokenId.value]) {
          commands.push(
            tx.token.create({
              data: {
                id: tokenId.value,
                chainId: chains[payload.chain],
                address: payload.contractAddress,
                symbol: payload.symbol,
                name: payload.name,
                decimals: payload.decimals ?? 0,
              },
            })
          );
        }
      }
    }

    // store
    await Promise.all(commands);
  }

  protected deserialize(
    payload: Buffer
  ): ft.streams.NewFungibleTokenStreamEvent {
    return ft.streams.newFungibleToken.serdes.deserialize(payload);
  }

  private getTokenId(token: ft.NewToken) {
    return new TokenId(new ChainId(chains[token.chain]), token.contractAddress);
  }
}

const chains: Record<string, number> = {
  "polygon-mumbai": 80001,
  "polygon-main": 137,
  "eth-main": 1,
  "bsc-main": 56,
};
