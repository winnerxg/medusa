import { createWorkflow, WorkflowData } from "@medusajs/workflows-sdk"

import { deleteInventoryItemStep } from "../steps"
import { removeRemoteLinkStep } from "../../common/steps/remove-remote-links"
import { Modules } from "@medusajs/utils"

export const deleteInventoryItemWorkflowId = "delete-inventory-item-workflow"
export const deleteInventoryItemWorkflow = createWorkflow(
  deleteInventoryItemWorkflowId,
  (input: WorkflowData<string[]>): WorkflowData<string[]> => {
    deleteInventoryItemStep(input)

    removeRemoteLinkStep({
      [Modules.INVENTORY]: { inventory_item_id: input },
    })
    return input
  }
)
