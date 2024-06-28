import { Context, DAL } from "@medusajs/types"
import { GetIsoStringFromDate, ModulesSdkUtils } from "@medusajs/utils"
import { PriceList } from "@models"
import { ServiceTypes } from "@types"

type InjectedDependencies = {
  priceListRepository: DAL.RepositoryService
}

export default class PriceListService extends ModulesSdkUtils.MedusaInternalService<InjectedDependencies>(
  PriceList
)<PriceList> {
  constructor(container: InjectedDependencies) {
    // @ts-ignore
    super(...arguments)
  }

  create(
    data: ServiceTypes.CreatePriceListDTO[],
    sharedContext?: Context
  ): Promise<PriceList[]>
  create(
    data: ServiceTypes.CreatePriceListDTO,
    sharedContext?: Context
  ): Promise<PriceList>

  async create(
    data: ServiceTypes.CreatePriceListDTO | ServiceTypes.CreatePriceListDTO[],
    sharedContext?: Context
  ): Promise<PriceList | PriceList[]> {
    const data_ = Array.isArray(data) ? data : [data]
    const priceLists = this.normalizePriceListDate(data_)
    return await super.create(priceLists, sharedContext)
  }

  // @ts-ignore
  update(data: any[], sharedContext?: Context): Promise<PriceList[]>
  // @ts-ignore
  update(data: any, sharedContext?: Context): Promise<PriceList>

  // TODO: Add support for selector? and then rm ts ignore
  // @ts-ignore
  async update(
    data: ServiceTypes.UpdatePriceListDTO | ServiceTypes.UpdatePriceListDTO[],
    sharedContext?: Context
  ): Promise<PriceList | PriceList[]> {
    const data_ = Array.isArray(data) ? data : [data]
    const priceLists = this.normalizePriceListDate(data_)
    return await super.update(priceLists, sharedContext)
  }

  protected normalizePriceListDate(
    data: (ServiceTypes.UpdatePriceListDTO | ServiceTypes.CreatePriceListDTO)[]
  ) {
    return data.map((priceListData: any) => {
      if (!!priceListData.starts_at) {
        priceListData.starts_at = GetIsoStringFromDate(priceListData.starts_at)
      }

      if (!!priceListData.ends_at) {
        priceListData.ends_at = GetIsoStringFromDate(priceListData.ends_at)
      }

      return priceListData
    })
  }
}
