import BigNumber from "bignumber.js";

export function getFromBigNumber(
  params: { value: string } & (
    | { token: { decimals: number } }
    | { decimals: number }
  )
) {
  return new BigNumber(params.value).shiftedBy(
    "token" in params ? -params.token.decimals : -params.decimals
  );
}

export function getToBigNumber(
  params: { value: string } & (
    | { token: { decimals: number } }
    | { decimals: number }
  )
) {
  return new BigNumber(params.value).shiftedBy(
    "token" in params ? params.token.decimals : params.decimals
  );
}

export function toBigNumber(  params: { value: string } & (
  | { token: { decimals: number } }
  | { decimals: number }
)) {
  return getToBigNumber(params).toNumber();
}

export function fromBigNumber(
  params: { value: string } & (
    | { token: { decimals: number } }
    | { decimals: number }
  )
) {
  return getFromBigNumber(params).toNumber();
}
export function getPrice(params:{over: number, under: number} | { over:BigNumber, under: BigNumber}) {
  if( typeof params.under === "number" && typeof params.over === "number" ) {
    return params.under > 0 ? params.over/params.under : null;
  } else if( params.over instanceof BigNumber && params.under instanceof BigNumber) {
    return params.under.gt(0)
        ? params.over.div(params.under).toNumber()
        : null;
  }
  return null;

}

export function addNumberStrings(
  params: { value1: string; value2: string } & (
    | { token: { decimals: number } }
    | { decimals: number }
  )
) {
  if ("token" in params) {
    return getFromBigNumber({ value: params.value1, token: params.token })
      .plus(getFromBigNumber({ value: params.value2, token: params.token }))
      .toFixed();
  }
  return getFromBigNumber({ value: params.value1, decimals: params.decimals })
    .plus(getFromBigNumber({ value: params.value2, decimals: params.decimals }))
    .toFixed();
}

export function subtractNumberStrings(
  params: { value1: string; value2: string } & (
    | { token: { decimals: number } }
    | { decimals: number }
  )
) {
  if ("token" in params) {
    return getFromBigNumber({ value: params.value1, token: params.token })
      .minus(getFromBigNumber({ value: params.value2, token: params.token }))
      .toFixed();
  }
  return getFromBigNumber({ value: params.value1, decimals: params.decimals })
    .minus(getFromBigNumber({ value: params.value2, decimals: params.decimals }))
    .toFixed();
}
