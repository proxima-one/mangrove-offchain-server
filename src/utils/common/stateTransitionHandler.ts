import { Offset, StreamEvent } from "@proximaone/stream-client-js";

export interface StreamEventHandler {
  getStreamName(): string;
  getCurrentStreamOffset(): Promise<Offset>;
  handleEvents(events: StreamEvent[]): Promise<void>;
}
