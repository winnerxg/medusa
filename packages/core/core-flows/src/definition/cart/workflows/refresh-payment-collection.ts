import {
  StepResponse,
  WorkflowData,
  createStep,
  createWorkflow,
  parallelize,
  transform,
} from "@medusajs/workflows-sdk"
import { useRemoteQueryStep } from "../../../common/steps/use-remote-query"
import { updatePaymentCollectionStep } from "../../../payment-collection"
import { deletePaymentSessionsWorkflow } from "../../../payment-collection/workflows/delete-payment-sessions"

type WorklowInput = {
  cart_id: string
}

interface StepInput {
  cart_id: string
}

// We export a step running the workflow too, so that we can use it as a subworkflow e.g. in the update cart workflows
export const refreshPaymentCollectionForCartStepId =
  "refresh-payment-collection-for-cart"
export const refreshPaymentCollectionForCartStep = createStep(
  refreshPaymentCollectionForCartStepId,
  async (data: StepInput, { container }) => {
    await refreshPaymentCollectionForCartWorkflow(container).run({
      input: {
        cart_id: data.cart_id,
      },
    })

    return new StepResponse(null)
  }
)

export const refreshPaymentCollectionForCartWorkflowId =
  "refresh-payment-collection-for-cart"
export const refreshPaymentCollectionForCartWorkflow = createWorkflow(
  refreshPaymentCollectionForCartWorkflowId,
  (input: WorkflowData<WorklowInput>): WorkflowData<void> => {
    const carts = useRemoteQueryStep({
      entry_point: "cart",
      fields: [
        "id",
        "total",
        "currency_code",
        "payment_collection.id",
        "payment_collection.payment_sessions.id",
      ],
      variables: { id: input.cart_id },
      throw_if_key_not_found: true,
    })

    const cart = transform({ carts }, (data) => data.carts[0])
    const deletePaymentSessionInput = transform(
      { paymentCollection: cart.payment_collection },
      (data) => {
        return {
          ids:
            data.paymentCollection?.payment_sessions?.map((ps) => ps.id) || [],
        }
      }
    )

    parallelize(
      deletePaymentSessionsWorkflow.runAsStep({
        input: deletePaymentSessionInput,
      }),
      updatePaymentCollectionStep({
        selector: { id: cart.payment_collection.id },
        update: {
          amount: cart.total,
          currency_code: cart.currency_code,
        },
      })
    )
  }
)
