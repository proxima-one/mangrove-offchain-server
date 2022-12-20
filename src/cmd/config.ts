export interface Config {
  chains: {
    [chain: number]: StreamsSchema;
  };
}

interface StreamsSchema {
  mangrove?: string[];
  tokens?: string[];
  strats?: string[];
}

export const defaultConfig: Config = {
  chains: {
    137: {
      mangrove: ["proxima.mangrove.polygon-main.domain-events.0_1"],
      strats: [],
      tokens: [],
    },
    80001: {
      mangrove: ["proxima.mangrove.polygon-mumbai.domain-events.0_3"],
      strats: ["proxima.mangrove.polygon-mumbai.strategies.0_2"],
      tokens: ["proxima.mangrove.polygon-mumbai.tokens.0_1"],
    },
  },
};
