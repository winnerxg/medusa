import {
  Context,
  DAL,
  FindConfig,
  OrderTypes,
  RepositoryService,
} from "@medusajs/types"
import {
  deduplicate,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  ModulesSdkUtils,
} from "@medusajs/utils"
import { OrderChange } from "@models"
import { OrderChangeStatus } from "@types"

type InjectedDependencies = {
  orderChangeRepository: DAL.RepositoryService
}

export default class OrderChangeService extends ModulesSdkUtils.MedusaInternalService<InjectedDependencies>(
  OrderChange
)<OrderChange> {
  protected readonly orderChangeRepository_: RepositoryService<OrderChange>

  constructor(container: InjectedDependencies) {
    // @ts-ignore
    super(...arguments)
    this.orderChangeRepository_ = container.orderChangeRepository
  }

  @InjectManager("orderChangeRepository_")
  async listCurrentOrderChange<TEntityMethod = OrderTypes.OrderDTO>(
    orderId: string | string[],
    config: FindConfig<TEntityMethod> = {},
    @MedusaContext() sharedContext: Context = {}
  ): Promise<OrderChange[]> {
    const allChanges = await super.list(
      { order_id: orderId },
      config ?? {
        select: ["order_id", "status", "version"],
        order: {
          order_id: "ASC",
          version: "DESC",
        },
      }
    )
    if (!allChanges.length) {
      return []
    }

    const lastChanges: string[] = []

    const seen = new Set()
    for (let i = 0; i < allChanges.length; i++) {
      if (seen.has(allChanges[i].order_id)) {
        continue
      }
      seen.add(allChanges[i].order_id)

      if (this.isActive(allChanges[i])) {
        lastChanges.push(allChanges[i].id)
      }
    }

    let orderChange!: OrderChange
    if (allChanges?.length > 0) {
      if (this.isActive(allChanges[0])) {
        orderChange = allChanges[0]
      }
    }

    if (!orderChange) {
      return []
    }

    const relations = deduplicate([...(config.relations ?? []), "actions"])
    config.relations = relations

    const queryConfig = ModulesSdkUtils.buildQuery<OrderChange>(
      {
        id: lastChanges,
        order: {
          items: {
            version: orderChange.version,
          },
        },
      },
      config
    )

    return await this.orderChangeRepository_.find(queryConfig, sharedContext)
  }

  isActive(orderChange: OrderChange): boolean {
    return (
      orderChange.status === OrderChangeStatus.PENDING ||
      orderChange.status === OrderChangeStatus.REQUESTED
    )
  }

  async create(
    data: Partial<OrderChange>[],
    sharedContext?: Context
  ): Promise<OrderChange[]>

  async create(
    data: Partial<OrderChange>,
    sharedContext?: Context
  ): Promise<OrderChange>

  @InjectTransactionManager("orderChangeRepository_")
  async create(
    data: Partial<OrderChange>[] | Partial<OrderChange>,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<OrderChange[] | OrderChange> {
    const dataArr = Array.isArray(data) ? data : [data]
    const activeOrderEdit = await this.listCurrentOrderChange(
      dataArr.map((d) => d.order_id!),
      {},
      sharedContext
    )

    if (activeOrderEdit.length > 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `An active order change already exists for the order(s) ${activeOrderEdit
          .map((a) => a.order_id)
          .join(",")}`
      )
    }

    return await super.create(dataArr, sharedContext)
  }
}
