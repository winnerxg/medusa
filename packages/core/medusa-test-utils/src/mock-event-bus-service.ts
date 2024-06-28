import {
  EventBusTypes,
  IEventBusModuleService,
  Message,
  Subscriber,
} from "@medusajs/types"

export default class EventBusService implements IEventBusModuleService {
  async emit<T>(
    data: Message<T> | Message<T>[],
    options: Record<string, unknown>
  ): Promise<void> {}

  subscribe(event: string | symbol, subscriber: Subscriber): this {
    return this
  }

  unsubscribe(
    event: string | symbol,
    subscriber: Subscriber,
    context?: EventBusTypes.SubscriberContext
  ): this {
    return this
  }

  releaseGroupedEvents(eventGroupId: string): Promise<void> {
    return Promise.resolve()
  }

  clearGroupedEvents(eventGroupId: string): Promise<void> {
    return Promise.resolve()
  }
}
