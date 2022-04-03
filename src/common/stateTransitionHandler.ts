import {
  State,
  StreamStateRef,
  Transition,
} from "@proximaone/stream-client-js";

export interface StateTransitionHandler {
  getCurrentStreamState(): Promise<StreamStateRef>;
  handleTransitions(transitions: Transition[]): Promise<void>;
}
