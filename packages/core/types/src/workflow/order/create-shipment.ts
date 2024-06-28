import { MetadataType } from "../../common"
import { BigNumberInput } from "../../totals"
import { CreateFulfillmentLabelWorkflowDTO } from "../fulfillment"

interface CreateOrderShipmentItem {
  id: string
  quantity: BigNumberInput
}

export interface CreateOrderShipmentWorkflowInput {
  order_id: string
  fulfillment_id: string
  created_by?: string // The id of the authenticated user
  items: CreateOrderShipmentItem[]
  labels: CreateFulfillmentLabelWorkflowDTO[]
  no_notification?: boolean
  metadata?: MetadataType
}
