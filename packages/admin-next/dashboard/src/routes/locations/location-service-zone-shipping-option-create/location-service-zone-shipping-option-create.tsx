import {
  json,
  useLoaderData,
  useParams,
  useSearchParams,
} from "react-router-dom"

import { RouteFocusModal } from "../../../components/route-modal"
import { useStockLocation } from "../../../hooks/api/stock-locations"
import { CreateShippingOptionsForm } from "./components/create-shipping-options-form"
import { LOC_CREATE_SHIPPING_OPTION_FIELDS } from "./constants"
import { stockLocationLoader } from "./loader"

export function LocationServiceZoneShippingOptionCreate() {
  const { location_id, fset_id, zone_id } = useParams()
  const [searchParams] = useSearchParams()
  const isReturn = searchParams.has("is_return")

  const initialData = useLoaderData() as Awaited<
    ReturnType<typeof stockLocationLoader>
  >

  const { stock_location, isPending, isError, error } = useStockLocation(
    location_id!,
    {
      fields: LOC_CREATE_SHIPPING_OPTION_FIELDS,
    },
    { initialData }
  )

  const zone = stock_location?.fulfillment_sets
    ?.find((f) => f.id === fset_id)
    ?.service_zones?.find((z) => z.id === zone_id)

  if (!zone) {
    throw json(
      { message: `Service zone with ID ${zone_id} was not found` },
      404
    )
  }

  if (isError) {
    throw error
  }

  const ready = !isPending && !!zone

  return (
    <RouteFocusModal prev={`/settings/locations/${location_id}`}>
      {ready && (
        <CreateShippingOptionsForm
          zone={zone}
          isReturn={isReturn}
          locationId={location_id!}
        />
      )}
    </RouteFocusModal>
  )
}
