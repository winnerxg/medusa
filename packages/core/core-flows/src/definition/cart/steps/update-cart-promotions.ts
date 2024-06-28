import { LinkModuleUtils, ModuleRegistrationName } from "@medusajs/modules-sdk"
import { IPromotionModuleService } from "@medusajs/types"
import { Modules, PromotionActions } from "@medusajs/utils"
import { createStep, StepResponse } from "@medusajs/workflows-sdk"

interface StepInput {
  id: string
  promo_codes?: string[]
  action?:
    | PromotionActions.ADD
    | PromotionActions.REMOVE
    | PromotionActions.REPLACE
}

export const updateCartPromotionsStepId = "update-cart-promotions"
export const updateCartPromotionsStep = createStep(
  updateCartPromotionsStepId,
  async (data: StepInput, { container }) => {
    const { promo_codes = [], id, action = PromotionActions.ADD } = data
    const remoteLink = container.resolve(LinkModuleUtils.REMOTE_LINK)
    const remoteQuery = container.resolve(LinkModuleUtils.REMOTE_QUERY)
    const promotionService = container.resolve<IPromotionModuleService>(
      ModuleRegistrationName.PROMOTION
    )

    const existingCartPromotionLinks = await remoteQuery({
      cart_promotion: {
        __args: { cart_id: [id] },
        fields: ["cart_id", "promotion_id"],
      },
    })

    const promotionLinkMap = new Map<string, any>(
      existingCartPromotionLinks.map((link) => [link.promotion_id, link])
    )

    const promotions = await promotionService.listPromotions(
      { code: promo_codes },
      { select: ["id"] }
    )

    const linksToCreate: any[] = []
    const linksToDismiss: any[] = []

    for (const promotion of promotions) {
      const linkObject = {
        [Modules.CART]: { cart_id: id },
        [Modules.PROMOTION]: { promotion_id: promotion.id },
      }

      if ([PromotionActions.ADD, PromotionActions.REPLACE].includes(action)) {
        linksToCreate.push(linkObject)
      }

      if (action === PromotionActions.REMOVE) {
        const link = promotionLinkMap.get(promotion.id)

        if (link) {
          linksToDismiss.push(linkObject)
        }
      }
    }

    if (action === PromotionActions.REPLACE) {
      for (const link of existingCartPromotionLinks) {
        linksToDismiss.push({
          [Modules.CART]: { cart_id: link.cart_id },
          [Modules.PROMOTION]: { promotion_id: link.promotion_id },
        })
      }
    }

    if (linksToDismiss.length) {
      await remoteLink.dismiss(linksToDismiss)
    }

    const createdLinks = linksToCreate.length
      ? await remoteLink.create(linksToCreate)
      : []

    return new StepResponse(null, {
      // @ts-expect-error
      createdLinkIds: createdLinks.map((link) => link.id),
      dismissedLinks: linksToDismiss,
    })
  },
  async (revertData, { container }) => {
    const remoteLink = container.resolve(LinkModuleUtils.REMOTE_LINK)

    if (revertData?.dismissedLinks?.length) {
      await remoteLink.create(revertData.dismissedLinks)
    }

    if (revertData?.createdLinkIds?.length) {
      // @ts-expect-error
      await remoteLink.delete(revertData.createdLinkIds)
    }
  }
)
