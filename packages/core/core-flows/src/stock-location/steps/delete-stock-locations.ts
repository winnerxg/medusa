import {
  DeleteEntityInput,
  ModuleRegistrationName,
} from "@medusajs/modules-sdk"
import { createStep, StepResponse } from "@medusajs/workflows-sdk"
import { Modules } from "@medusajs/utils"

export const deleteStockLocationsStepId = "delete-stock-locations-step"
export const deleteStockLocationsStep = createStep(
  deleteStockLocationsStepId,
  async (input: string[], { container }) => {
    const service = container.resolve(ModuleRegistrationName.STOCK_LOCATION)

    const softDeletedEntities = await service.softDeleteStockLocations(input)

    return new StepResponse(
      {
        [Modules.STOCK_LOCATION]: softDeletedEntities,
      } as DeleteEntityInput,
      input
    )
  },
  async (deletedLocationIds, { container }) => {
    if (!deletedLocationIds?.length) {
      return
    }
    const service = container.resolve(ModuleRegistrationName.STOCK_LOCATION)

    await service.restoreStockLocations(deletedLocationIds)
  }
)
