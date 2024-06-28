import { DAL } from "@medusajs/types"
import {
  DALUtils,
  Searchable,
  createPsqlIndexStatementHelper,
  generateEntityId,
} from "@medusajs/utils"
import {
  BeforeCreate,
  Collection,
  Entity,
  Filter,
  OnInit,
  OneToMany,
  OneToOne,
  OptionalProps,
  PrimaryKey,
  Property,
  Rel,
} from "@mikro-orm/core"
import CampaignBudget from "./campaign-budget"
import Promotion from "./promotion"

type OptionalRelations = "budget"
type OptionalFields =
  | "description"
  | "starts_at"
  | "ends_at"
  | DAL.SoftDeletableEntityDateColumns

const tableName = "promotion_campaign"
const CampaignUniqueCampaignIdentifier = createPsqlIndexStatementHelper({
  tableName,
  columns: ["campaign_identifier"],
  unique: true,
  where: "deleted_at IS NULL",
})

@Entity({ tableName })
@Filter(DALUtils.mikroOrmSoftDeletableFilterOptions)
export default class Campaign {
  [OptionalProps]?: OptionalFields | OptionalRelations

  @PrimaryKey({ columnType: "text" })
  id!: string

  @Searchable()
  @Property({ columnType: "text" })
  name: string

  @Searchable()
  @Property({ columnType: "text", nullable: true })
  description: string | null = null

  @Property({ columnType: "text" })
  @CampaignUniqueCampaignIdentifier.MikroORMIndex()
  campaign_identifier: string

  @Property({
    columnType: "timestamptz",
    nullable: true,
  })
  starts_at: Date | null = null

  @Property({
    columnType: "timestamptz",
    nullable: true,
  })
  ends_at: Date | null = null

  @OneToOne({
    entity: () => CampaignBudget,
    mappedBy: (cb) => cb.campaign,
    cascade: ["soft-remove"] as any,
    nullable: true,
  })
  budget: Rel<CampaignBudget> | null = null

  @OneToMany(() => Promotion, (promotion) => promotion.campaign)
  promotions = new Collection<Rel<Promotion>>(this)

  @Property({
    onCreate: () => new Date(),
    columnType: "timestamptz",
    defaultRaw: "now()",
  })
  created_at: Date

  @Property({
    onCreate: () => new Date(),
    onUpdate: () => new Date(),
    columnType: "timestamptz",
    defaultRaw: "now()",
  })
  updated_at: Date

  @Property({ columnType: "timestamptz", nullable: true })
  deleted_at: Date | null = null

  @BeforeCreate()
  onCreate() {
    this.id = generateEntityId(this.id, "procamp")
  }

  @OnInit()
  onInit() {
    this.id = generateEntityId(this.id, "procamp")
  }
}
