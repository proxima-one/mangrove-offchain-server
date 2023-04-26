import { Prisma, PrismaClient } from "@prisma/client";


export async function clearPostgres(prisma:PrismaClient) {
  const models = Prisma.dmmf.datamodel.models;
  const schema = process.env["DEV_SCHEMA"];
  const views = ((await prisma.$queryRawUnsafe('SELECT table_name FROM information_schema.views WHERE table_schema = current_schema()')) as {table_name:string}[]).map( v => v.table_name);
  const tables = models.map((model) => model.name).filter( v => !views.includes(v));

  await prisma.$transaction([

    ...tables.map((table) => {
      return prisma.$executeRawUnsafe(`DELETE FROM ${schema}."${table}";`);
    }),
  ]);
}
