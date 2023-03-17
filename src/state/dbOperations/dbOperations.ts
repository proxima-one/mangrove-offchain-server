import * as prisma from "@prisma/client";


export class DbOperations {
  public constructor(protected readonly tx: PrismaTx) {}
}

export type PrismaTx = Omit<
  prisma.PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use"
>;

export function toNewVersionUpsert<T extends { id: string | number }>(
  createEntity: T,
  updateCurrentVersion: string
): Upsert<T> {
  return {
    where: { id: createEntity.id },
    create: createEntity,
    update: { currentVersionId: updateCurrentVersion },
  };
}

export interface Upsert<T> {
  where: { id: any };
  create: T;
  update: { currentVersionId: string};
}
