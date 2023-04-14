import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class Market {
  @Field()
  baseSymbol!: string;

  @Field()
  quoteSymbol!: string;
  
  @Field()
  chain!: number;

}