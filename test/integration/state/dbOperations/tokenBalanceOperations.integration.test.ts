import { Account, Token, TokenBalance, TokenBalanceVersion, Transaction } from "@prisma/client";
import assert from "assert";
import { before, describe } from "mocha";
import { TokenBalanceOperations } from "src/state/dbOperations/tokenBalanceOperations";
import {
  AccountId,
  ChainId,
  TokenBalanceId,
  TokenBalanceVersionId,
  TokenId
} from "src/state/model";
import { prisma } from "utils/test/mochaHooks";

describe("Token Balance Operations Integration test suite", () => {
  let tokenBalanceOperations: TokenBalanceOperations;
  before(() => {
    tokenBalanceOperations = new TokenBalanceOperations(prisma);
  });

  const chainId = new ChainId(10);
  const tokenId = new TokenId(chainId, "token");
  const reserveId = new AccountId(chainId, "reserveAddress");
  const tokenBalanceId = new TokenBalanceId({accountId:reserveId, tokenId});
  const tokenBalanceVersionId = new TokenBalanceVersionId({tokenBalanceId, versionNumber:0})
  let tx:Transaction;
  let token:Token;
  let reserve:Account;
  let tokenBalance:TokenBalance;
  let tokenBalanceVersion:TokenBalanceVersion;

  beforeEach(async () => {

    tx = await prisma.transaction.create({
      data: {
        id: "txId",
        chainId: chainId.value,
        txHash: "txHash",
        from: "from",
        blockNumber: 0,
        blockHash: "blockHash",
        time: new Date()
      }
    })

    token = await prisma.token.create({
      data: {
        id: tokenId.value,
        chainId: chainId.value,
        address: tokenId.tokenAddress,
        symbol: "t",
        name: "token",
        decimals: 0,
      },
    });

    reserve = await prisma.account.create( {
      data: {
        id: reserveId.value,
        chainId: chainId.value,
        address: reserveId.address
      }
    })

    tokenBalance = await prisma.tokenBalance.create( {
      data: {
        id: tokenBalanceId.value,
        txId: tx.id,
        reserveId: reserveId.value,
        tokenId: tokenId.value,
        currentVersionId: tokenBalanceVersionId.value
      }
    })

    tokenBalanceVersion = await prisma.tokenBalanceVersion.create({
      data: {
        id: tokenBalanceVersionId.value,
        txId: tx.id,
        tokenBalanceId: tokenBalanceId.value,
        deposit: "0",
        withdrawal: "0",
        spent: "0",
        earned: "0",
        balance: "0",
        versionNumber: 0
      }
    })


  });


  describe("addTokenBalanceVersion", () => {
    // has  reserve
    // no reserve
    // has existing token balance
    // no existing token balance
    it("Has existing reserve account + has existing token balance  ", async () => {
      assert.strictEqual(await prisma.tokenBalance.count(), 1);
      assert.strictEqual(await prisma.tokenBalanceVersion.count(), 1);
      assert.strictEqual(await prisma.account.count(), 1);
      const { updatedOrNewTokenBalance,newVersion} = await tokenBalanceOperations.addTokenBalanceVersion({tokenBalanceId, txId:tx.id, updateFunc:(version) => { version.deposit="10"; version.balance="10" }});
      assert.strictEqual(await prisma.tokenBalance.count(), 1);
      assert.strictEqual(await prisma.tokenBalanceVersion.count(), 2);
      assert.strictEqual(await prisma.account.count(), 1);
      assert.deepStrictEqual( {
        ...tokenBalanceVersion, 
        deposit:"10", 
        balance:"10",
        versionNumber: 1,
        prevVersionId: tokenBalanceVersion.id,
        id: new TokenBalanceVersionId({tokenBalanceId, versionNumber:1}).value
       }, newVersion )
      assert.deepStrictEqual({
        ...tokenBalance,
        currentVersionId:new TokenBalanceVersionId({tokenBalanceId, versionNumber:1}).value
      },  updatedOrNewTokenBalance)
    })

    it("Has no existing reserve account + has no existing token balance  ", async () => {
      assert.strictEqual(await prisma.tokenBalance.count(), 1);
      assert.strictEqual(await prisma.tokenBalanceVersion.count(), 1);
      assert.strictEqual(await prisma.account.count(), 1);
      const newReserveId = new AccountId(chainId, "reserveAddress2")
      const newTokenBalanceId = new TokenBalanceId({accountId:newReserveId, tokenId})
      const { updatedOrNewTokenBalance,newVersion} = await tokenBalanceOperations.addTokenBalanceVersion({tokenBalanceId: newTokenBalanceId, txId:tx.id });
      assert.strictEqual(await prisma.tokenBalance.count(), 2);
      assert.strictEqual(await prisma.tokenBalanceVersion.count(), 2);
      assert.strictEqual(await prisma.account.count(), 2);
      assert.deepStrictEqual( {
        id: new TokenBalanceVersionId({tokenBalanceId:newTokenBalanceId, versionNumber:0}).value,
        txId: tx.id,
        tokenBalanceId: newTokenBalanceId.value,
        deposit:"0", 
        withdrawal: "0",
        spent: "0",
        earned: "0",
        balance:"0",
        versionNumber: 0,
        prevVersionId: null,
       }, newVersion )
       assert.deepStrictEqual({
        id: newTokenBalanceId.value,
        txId: tx.id,
        reserveId: newReserveId.value,
        tokenId: tokenId.value,
        currentVersionId: new TokenBalanceVersionId({tokenBalanceId:newTokenBalanceId, versionNumber:0}).value
      },  updatedOrNewTokenBalance)
    })

    it("Has existing reserve account + has no existing token balance  ", async () => {
      assert.strictEqual(await prisma.tokenBalance.count(), 1);
      assert.strictEqual(await prisma.tokenBalanceVersion.count(), 1);
      assert.strictEqual(await prisma.account.count(), 1);
      const newTokenId = new TokenId(chainId, "token2");
      const newTokenBalanceId = new TokenBalanceId({accountId:reserveId, tokenId:newTokenId})
      const { updatedOrNewTokenBalance,newVersion} = await tokenBalanceOperations.addTokenBalanceVersion({tokenBalanceId: newTokenBalanceId, txId:tx.id });
      assert.strictEqual(await prisma.tokenBalance.count(), 2);
      assert.strictEqual(await prisma.tokenBalanceVersion.count(), 2);
      assert.strictEqual(await prisma.account.count(), 1);
      assert.deepStrictEqual( {
        id: new TokenBalanceVersionId({tokenBalanceId:newTokenBalanceId, versionNumber:0}).value,
        txId: tx.id,
        tokenBalanceId: newTokenBalanceId.value,
        deposit:"0", 
        withdrawal: "0",
        spent: "0",
        earned: "0",
        balance:"0",
        versionNumber: 0,
        prevVersionId: null,
       }, newVersion )
       assert.deepStrictEqual({
        id: newTokenBalanceId.value,
        txId: tx.id,
        reserveId: reserveId.value,
        tokenId: newTokenId.value,
        currentVersionId: new TokenBalanceVersionId({tokenBalanceId:newTokenBalanceId, versionNumber:0}).value
      },  updatedOrNewTokenBalance)
    })
   
  });

  describe("getTokenBalanceFromKandel",  () => {
    // no kandel
    // has kandel, but not token balance
    // has kandel and token balance
  })

  describe("getCurrentTokenBalanceVersion",  () => {
    // no current version
    // has current version
  })

  describe("getTokenBalanceId", () => {
    // with id
    // with token balance
  })

  describe("deleteLatestTokenBalanceVersion",  () => {
    // no token balance
    // no prev
    // has prev
  })

  it("createTokenBalanceEvent", async () => {

  })

  it("createTokenBalanceDepositEvent", async () => {
    
  })

  it("createTokenBalanceWithdrawalEvent", async () => {
    
  })

});
