export function createPatternMatcher<TInput extends { type: string }>() {
  type InputMap<U> = {
    [K in TInput["type"]]: U extends { type: K } ? U : never;
  };
  type Pattern<T> = {
    [K in keyof InputMap<TInput>]: (query: InputMap<TInput>[K]) => T;
  };

  function inputMatcher<T>(pattern: Pattern<T>): (query: TInput) => T {
    return (query) => (pattern as any)[query.type](query as any);
  }

  return inputMatcher;
}
