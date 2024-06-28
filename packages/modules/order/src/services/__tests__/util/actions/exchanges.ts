import { OrderChangeEvent } from "../../../../types"
import { ChangeActionType, calculateOrderChange } from "../../../../utils"

describe("Order Exchange - Actions", function () {
  const originalOrder = {
    items: [
      {
        id: "1",
        quantity: 1,
        unit_price: 10,

        detail: {
          quantity: 1,
          shipped_quantity: 1,
          fulfilled_quantity: 1,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
      {
        id: "2",
        quantity: 2,
        unit_price: 100,

        detail: {
          quantity: 2,
          shipped_quantity: 1,
          fulfilled_quantity: 1,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
      {
        id: "3",
        quantity: 3,
        unit_price: 20,

        detail: {
          quantity: 3,
          shipped_quantity: 3,
          fulfilled_quantity: 3,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
    ],
    shipping_methods: [
      {
        id: "ship_123",
        price: 0,
      },
    ],
    total: 270,
  }

  it("should perform an item exchage", function () {
    const actions = [
      {
        action: ChangeActionType.RETURN_ITEM,
        reference_id: "return_123",
        details: {
          reference_id: "3",
          quantity: 1,
        },
      },
      {
        action: ChangeActionType.ITEM_ADD,
        details: {
          reference_id: "item_555",
          unit_price: 50,
          quantity: 1,
        },
      },
      {
        action: ChangeActionType.SHIPPING_ADD,
        reference_id: "shipping_345",
        amount: 5,
      },
      {
        action: ChangeActionType.SHIPPING_ADD,
        reference_id: "return_shipping_345",
        amount: 7.5,
      },
    ] as OrderChangeEvent[]

    const changes = calculateOrderChange({
      order: originalOrder,
      actions: actions,
    })

    const sumToJSON = JSON.parse(JSON.stringify(changes.summary))
    expect(sumToJSON).toEqual({
      transaction_total: 0,
      original_order_total: 270,
      current_order_total: 312.5,
      temporary_difference: 62.5,
      future_difference: 0,
      future_temporary_difference: 0,
      pending_difference: 312.5,
      difference_sum: 42.5,
      paid_total: 0,
      refunded_total: 0,
    })

    const toJson = JSON.parse(JSON.stringify(changes.order.items))
    expect(toJson).toEqual([
      {
        id: "1",
        quantity: 1,
        unit_price: 10,
        detail: {
          quantity: 1,
          shipped_quantity: 1,
          fulfilled_quantity: 1,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
      {
        id: "2",
        quantity: 2,
        unit_price: 100,
        detail: {
          quantity: 2,
          shipped_quantity: 1,
          fulfilled_quantity: 1,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
      {
        id: "3",
        quantity: 3,
        unit_price: 20,
        detail: {
          quantity: 3,
          shipped_quantity: 3,
          fulfilled_quantity: 3,
          return_requested_quantity: "1",
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
      {
        id: "item_555",
        unit_price: 50,
        quantity: 1,
      },
    ])
  })
})
