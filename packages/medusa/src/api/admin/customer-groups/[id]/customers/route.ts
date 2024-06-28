import { linkCustomersToCustomerGroupWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "../../../../../types/routing"

import { LinkMethodRequest } from "@medusajs/types"
import { refetchCustomerGroup } from "../../helpers"

export const POST = async (
  req: AuthenticatedMedusaRequest<LinkMethodRequest>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const { add, remove } = req.validatedBody

  const workflow = linkCustomersToCustomerGroupWorkflow(req.scope)
  await workflow.run({
    input: {
      id,
      add,
      remove,
    },
  })

  const customerGroup = await refetchCustomerGroup(
    req.params.id,
    req.scope,
    req.remoteQueryConfig.fields
  )
  res.status(200).json({ customer_group: customerGroup })
}
