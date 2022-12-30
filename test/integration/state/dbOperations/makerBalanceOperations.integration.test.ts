import { MakerBalance, MakerBalanceVersion } from "@prisma/client";
import assert from "assert";
import { before, describe, it } from "mocha";
import { MakerBalanceOperations } from "src/state/dbOperations/makerBalanceOperations";
import {
  AccountId,
  ChainId,
  MakerBalanceId,
  MakerBalanceVersionId,
  MangroveId,
} from "src/state/model";
import { prisma } from "utils/test/mochaHooks";

describe("Maker Balance Operations Integration test suite", () => {
  let makerBalanceOperations: MakerBalanceOperations;
  before(() => {
    makerBalanceOperations = new MakerBalanceOperations(prisma);
  });

  const chainId = new ChainId(10);
  const mangroveId = new MangroveId(chainId, "mangroveId");
  const makerBalanceId = new MakerBalanceId(mangroveId, "makerId");
  const makerBalanceVersionId = new MakerBalanceVersionId(makerBalanceId, 0);
  const makerId = new AccountId(chainId, "makerId");
  let makerBalance:MakerBalance;
  let makerBalanceVersion:MakerBalanceVersion;

  beforeEach(async () => {
    makerBalance = await prisma.makerBalance.create({
      data: {
        id: makerBalanceId.value,
        mangroveId: mangroveId.value,
        makerId: makerId.value,
        currentVersionId: makerBalanceVersionId.value,
      },
    });
    makerBalanceVersion = await prisma.makerBalanceVersion.create({
      data: {
        id: makerBalanceVersionId.value,
        makerBalanceId: makerBalanceId.value,
        txId: "txId",
        versionNumber: 0,
        prevVersionId: null,
        balance: "0",
      },
    });
  });

  describe("addVersionedMakerBalance", () => {
    it("makerBalance===null", async () => {
      const makerBalanceId = new MakerBalanceId(
        new MangroveId(new ChainId(10), "mangroveId"),
        "noMatch"
      );

      assert.strictEqual(await prisma.makerBalance.count(), 1);
      await makerBalanceOperations.addVersionedMakerBalance(
        makerBalanceId,
        "txId",
        (m) => (m.balance = "10")
      );
      assert.strictEqual(await prisma.makerBalance.count(), 2);
      const makerBalance = await prisma.makerBalance.findUnique({
        where: { id: makerBalanceId.value },
      });
      assert.strictEqual(makerBalance?.id, makerBalanceId.value);
      assert.strictEqual(
        makerBalance.mangroveId,
        makerBalanceId.mangroveId.value
      );
      assert.strictEqual(
        makerBalance.makerId,
        new AccountId(makerBalanceId.mangroveId.chainId, makerBalanceId.address)
          .value
      );
      const makerBalanceVersionId = new MakerBalanceVersionId(
        makerBalanceId,
        0
      );
      assert.strictEqual(
        makerBalance.currentVersionId,
        makerBalanceVersionId.value
      );
      const makerBalanceVersion = await prisma.makerBalanceVersion.findUnique({
        where: { id: makerBalance.currentVersionId },
      });
      assert.strictEqual(makerBalanceVersion?.id, makerBalanceVersionId.value);
      assert.strictEqual(
        makerBalanceVersion.makerBalanceId,
        makerBalanceId.value
      );
      assert.strictEqual(makerBalanceVersion.txId, "txId");
      assert.strictEqual(makerBalanceVersion.versionNumber, 0);
      assert.strictEqual(makerBalanceVersion.prevVersionId, null);
      assert.strictEqual(makerBalanceVersion.balance, "10");
    });

    it("makerBalance!=null", async () => {


      assert.strictEqual(await prisma.makerBalance.count(), 1);
      await makerBalanceOperations.addVersionedMakerBalance(
        makerBalanceId,
        "txId",
        (m) => (m.balance = "10")
      );
      assert.strictEqual(await prisma.makerBalance.count(), 1);
      const makerBalance = await prisma.makerBalance.findUnique({
        where: { id: makerBalanceId.value },
      });
      assert.strictEqual(makerBalance?.id, makerBalanceId.value);
      assert.strictEqual(
        makerBalance.mangroveId,
        makerBalanceId.mangroveId.value
      );
      assert.strictEqual(
        makerBalance.makerId,
        makerId.value
      );
      const makerBalanceVersionId = new MakerBalanceVersionId(
        makerBalanceId,
        1
      );
      assert.strictEqual(
        makerBalance.currentVersionId,
        makerBalanceVersionId.value
      );
      const makerBalanceVersion = await prisma.makerBalanceVersion.findUnique({
        where: { id: makerBalance.currentVersionId },
      });
      assert.strictEqual(makerBalanceVersion?.id, makerBalanceVersionId.value);
      assert.strictEqual(
        makerBalanceVersion.makerBalanceId,
        makerBalanceId.value
      );
      assert.strictEqual(makerBalanceVersion.txId, "txId");
      assert.strictEqual(makerBalanceVersion.versionNumber, 1);
      assert.strictEqual(
        makerBalanceVersion.prevVersionId,
        new MakerBalanceVersionId(makerBalanceId, 0).value
      );
      assert.strictEqual(makerBalanceVersion.balance, "10");
    });
  });

  describe("getCurrentMakerBalanceVersion", () => {
    it("currentVersion not found", async () => {
      const noMatch = {
        id: "noMatch",
        mangroveId: "mangroveId",
        makerId: "10-address",
        currentVersionId: "noMatch",
      };

      await assert.rejects(
        async () =>
          await makerBalanceOperations.getCurrentMakerBalanceVersion(
            noMatch
          )
      );
    });

    it("currentVersion found", async () => {

      const currentVersion =
        await makerBalanceOperations.getCurrentMakerBalanceVersion(
          makerBalance
        );
      assert.deepStrictEqual(makerBalanceVersion, currentVersion);
    });
  });

  describe("deleteLatestMakerBalanceVersion", () => {
    it("MakerBalance not found", async () => {
      const noMatch = new MakerBalanceId(
        new MangroveId(new ChainId(10), "abcd"),
        "address"
      );
      await assert.rejects(
        makerBalanceOperations.deleteLatestMakerBalanceVersion(noMatch)
      );
    });

    it("No prevVersion", async () => {

      assert.strictEqual(await prisma.makerBalance.count(), 1);
      assert.strictEqual(await prisma.makerBalanceVersion.count(), 1);
      await makerBalanceOperations.deleteLatestMakerBalanceVersion(
        makerBalanceId
      );
      assert.strictEqual(await prisma.makerBalance.count(), 0);
      assert.strictEqual(await prisma.makerBalanceVersion.count(), 0);
    });

    it("Has prevVersion", async () => {

      await makerBalanceOperations.addVersionedMakerBalance(
        makerBalanceId,
        "txId",
        (m) => (m.balance = "10")
      );
      const oldMakerBalance = await prisma.makerBalance.findUnique({
        where: { id: makerBalanceId.value },
      });
      const oldVersionId = new MakerBalanceVersionId(makerBalanceId,1);
      assert.strictEqual(
        oldMakerBalance?.currentVersionId,
        oldVersionId.value
      );
      assert.strictEqual(await prisma.makerBalance.count(), 1);
      assert.strictEqual(await prisma.makerBalanceVersion.count(), 2);
      await makerBalanceOperations.deleteLatestMakerBalanceVersion(
        makerBalanceId
      );
      assert.strictEqual(await prisma.makerBalance.count(), 1);
      assert.strictEqual(await prisma.makerBalanceVersion.count(), 1);
      const newMakerBalance = await prisma.makerBalance.findUnique({
        where: { id: makerBalanceId.value },
      });
      const newVersionId = new MakerBalanceVersionId(makerBalanceId,0);
      assert.notDeepStrictEqual(newMakerBalance, oldMakerBalance);
      assert.strictEqual(
        newMakerBalance?.currentVersionId,
        newVersionId.value
      );
    });
  });


});
