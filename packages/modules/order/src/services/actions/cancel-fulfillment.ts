import { Context, OrderTypes } from "@medusajs/types"
import { ChangeActionType } from "../../utils"

export async function cancelFulfillment(
  this: any,
  data: OrderTypes.CancelOrderFulfillmentDTO,
  sharedContext?: Context
): Promise<void> {
  const items = data.items.map((item) => {
    return {
      action: ChangeActionType.CANCEL_ITEM_FULFILLMENT,
      internal_note: item.internal_note,
      reference: data.reference,
      reference_id: data.reference_id,
      claim_id: data.claim_id,
      exchange_id: data.exchange_id,
      details: {
        reference_id: item.id,
        quantity: item.quantity,
        metadata: item.metadata,
      },
    }
  })

  const change = await this.createOrderChange_(
    {
      order_id: data.order_id,
      description: data.description,
      internal_note: data.internal_note,
      created_by: data.created_by,
      metadata: data.metadata,
      actions: items,
    },
    sharedContext
  )

  await this.confirmOrderChange(change[0].id, sharedContext)
}
