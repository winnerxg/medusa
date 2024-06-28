import { InventoryLevelDTO, InventoryTypes } from "@medusajs/types"
import { WorkflowData, createWorkflow } from "@medusajs/workflows-sdk"

import { updateInventoryLevelsStep } from "../steps/update-inventory-levels"

interface WorkflowInput {
  updates: InventoryTypes.BulkUpdateInventoryLevelInput[]
}
export const updateInventoryLevelsWorkflowId =
  "update-inventory-levels-workflow"
export const updateInventoryLevelsWorkflow = createWorkflow(
  updateInventoryLevelsWorkflowId,
  (input: WorkflowData<WorkflowInput>): WorkflowData<InventoryLevelDTO[]> => {
    return updateInventoryLevelsStep(input.updates)
  }
)
