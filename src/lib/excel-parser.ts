import * as XLSX from 'xlsx'

// ============================================
// 共通ユーティリティ
// ============================================

type Row = unknown[]
type Sheet = Row[]

function getSheet(workbook: XLSX.WorkBook, namePattern: string): Sheet | null {
  const name = workbook.SheetNames.find(n => n.includes(namePattern))
  if (!name) return null
  const ws = workbook.Sheets[name]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Sheet
}

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,¥]/g, ''))
  return isNaN(n) ? null : n
}

function dateToMonth(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-01`
  }
  const s = String(v)
  const match = s.match(/(\d{4})[年/\-](\d{1,2})/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-01`
  return null
}

// ============================================
// 結果型
// ============================================

export interface ImportResult {
  projects: Record<string, unknown>[]
  project_details: Record<string, unknown>[]
  project_costs: Record<string, unknown>[]
  project_subcontracts: Record<string, unknown>[]
  project_actuals: Record<string, unknown>[]
  fixed_costs: Record<string, unknown>[]
  personnel: Record<string, unknown>[]
  personnel_payments: Record<string, unknown>[]
  influencers: Record<string, unknown>[]
  influencer_payments: Record<string, unknown>[]
  invoices: Record<string, unknown>[]
  errors: string[]
}

// ============================================
// メインパーサー
// ============================================

export function parseExcel(workbook: XLSX.WorkBook): ImportResult {
  const result: ImportResult = {
    projects: [],
    project_details: [],
    project_costs: [],
    project_subcontracts: [],
    project_actuals: [],
    fixed_costs: [],
    personnel: [],
    personnel_payments: [],
    influencers: [],
    influencer_payments: [],
    invoices: [],
    errors: [],
  }

  try { parseProjectBlocks(workbook, result) } catch (e) { result.errors.push(`案件ブロック: ${e}`) }
  try { parseCostSheet(workbook, result) } catch (e) { result.errors.push(`事業コスト: ${e}`) }
  try { parsePersonnelSheet(workbook, result) } catch (e) { result.errors.push(`人件費: ${e}`) }
  try { parseInfluencerSheet(workbook, result) } catch (e) { result.errors.push(`インフルエンサー: ${e}`) }
  try { parseInvoiceSheet(workbook, result) } catch (e) { result.errors.push(`支払い情報: ${e}`) }

  return result
}

// ============================================
// (B) 案件ごと収支管理（入力）
// ============================================

function parseProjectBlocks(workbook: XLSX.WorkBook, result: ImportResult) {
  const sheet = getSheet(workbook, '案件ごと収支管理')
  if (!sheet) return

  // ブロック境界を検出（B列=カラム1のプロジェクト名が変わるタイミング）
  const blocks: { name: string; startRow: number; endRow: number }[] = []
  let currentName = ''
  let blockStart = -1

  for (let i = 0; i < sheet.length; i++) {
    const row = sheet[i]
    if (!row) continue
    const cellB = str(row[1])
    if (cellB && cellB !== currentName && !cellB.includes('大項目')) {
      if (blockStart >= 0) {
        blocks.push({ name: currentName, startRow: blockStart, endRow: i - 1 })
      }
      currentName = cellB
      blockStart = i
    }
  }
  if (blockStart >= 0) {
    blocks.push({ name: currentName, startRow: blockStart, endRow: sheet.length - 1 })
  }

  // 各ブロックをパース
  for (const block of blocks) {
    const project: Record<string, unknown> = {
      display_name: block.name,
      project_number: '',
      project_name: block.name,
      client: '',
      status: '見込み',
    }
    const details: Record<string, unknown> = {}
    const costs: Record<string, unknown>[] = []
    const subcontracts: Record<string, unknown>[] = []
    const actuals: Record<string, unknown> = {}

    // display_nameからproject_numberとproject_nameを分割
    const nameMatch = block.name.match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳\d.]+)\s*(.+)$/)
    if (nameMatch) {
      project.project_number = nameMatch[1]
      project.project_name = nameMatch[2]
    }

    let currentSection = ''

    for (let i = block.startRow; i <= block.endRow; i++) {
      const row = sheet[i]
      if (!row) continue
      const colC = str(row[2]) // 大項目
      const colD = str(row[3]) // 項目名
      const colE = row[4]      // 値
      const colH = str(row[7]) // 右側ブロック項目名
      const colI = row[8]      // 右側ブロック値
      const colJ = row[9]      // 右側ブロック（粗利率等）

      // 大項目でセクション切替
      if (colC) currentSection = colC

      // 左側ブロック: D列項目名 → テーブル.カラム マッピング
      if (colD) {
        mapProjectField(project, details, costs, subcontracts, currentSection, colD, colE, row)
      }

      // 右側ブロック（H列）→ project_actuals
      if (colH) {
        mapActualsField(actuals, colH, colI, colJ)
      }
    }

    result.projects.push(project)
    if (Object.keys(details).length > 0) result.project_details.push(details)
    costs.forEach(c => result.project_costs.push(c))
    // v2: 外注先の委託金額をproject_costsに自動連動
    subcontracts.forEach((s, idx) => {
      result.project_subcontracts.push(s)
      if (s.delegated_amount && (s.delegated_amount as number) > 0) {
        result.project_costs.push({
          cost_type: `subcontract_${idx + 1}`,
          cost_label: `${s.company_name} 支払額`,
          amount: s.delegated_amount,
          target_month: project.billing_month || null,
          note: null,
        })
      }
    })
    if (Object.keys(actuals).length > 0) result.project_actuals.push(actuals)
  }
}

function mapProjectField(
  project: Record<string, unknown>,
  details: Record<string, unknown>,
  costs: Record<string, unknown>[],
  subcontracts: Record<string, unknown>[],
  section: string,
  fieldName: string,
  value: unknown,
  row: Row,
) {
  // 基本情報
  if (fieldName.includes('請求月')) project.billing_month = dateToMonth(value)
  else if (fieldName.includes('請求先')) project.client = str(value)
  else if (fieldName.includes('請求金額')) project.billing_amount = num(value)
  else if (fieldName.includes('請求書受け取り月')) { /* ignored - field removed */ }

  // コスト明細
  // YMS支払額 → YMS subcontractのdelegated_amountに設定
  else if (fieldName.includes('YMS支払額')) {
    const ymsSub = subcontracts.find(s => s.company_name === 'YMS')
    if (ymsSub) ymsSub.delegated_amount = num(value) || 0
  }
  // その他代理店支払額 → エニドアsubcontractのdelegated_amountに設定
  else if (fieldName.includes('その他代理店支払額')) {
    const note = str(row[5])
    const enidoorSub = subcontracts.find(s => s.company_name === 'エニドア')
    if (enidoorSub) {
      enidoorSub.delegated_amount = num(value) || 0
      // エニドア分売上 = 保証再生数×受注単価（notesから推定、またはdelegated_budget/revenueを設定）
      if (!enidoorSub.delegated_budget) enidoorSub.delegated_budget = num(value) || 0
      if (!enidoorSub.delegated_revenue) enidoorSub.delegated_revenue = num(value) || 0
    } else if (note) {
      // 別の代理店（アドベスト等）の場合は新規エントリ
      subcontracts.push({
        sort_order: subcontracts.length + 1,
        company_name: note,
        delegated_amount: num(value) || 0,
        delegated_budget: num(value) || 0,
        delegated_revenue: num(value) || 0,
        notes: '',
      })
    }
  }
  else if (fieldName.includes('TONYAユーザー支払額'))
    costs.push({ cost_type: 'tonya_user_payment', cost_label: 'TONYAユーザー支払額', amount: num(value) || 0, target_month: null })
  else if (fieldName.includes('広告配信費'))
    costs.push({ cost_type: 'ad_delivery', cost_label: '広告配信費', amount: num(value) || 0, target_month: null })

  // 案件概要
  else if (fieldName === '予算' && !section.includes('YMS')) details.budget = num(value)
  else if (fieldName.includes('受注単価') || fieldName.includes('再生単価')) details.unit_price = num(value)
  else if (fieldName.includes('保証再生数') && section.includes('案件概要')) details.guaranteed_views = num(value)
  else if (fieldName.includes('小売マージン')) details.retail_margin = num(value)
  else if (fieldName.includes('代理店マージン') && section.includes('案件概要')) details.agency_margin = num(value)
  else if (fieldName.includes('TONYA売上')) details.tonya_revenue = num(value)
  else if (fieldName.includes('商品単価') && section.includes('案件概要')) details.product_unit_price = num(value)
  else if (fieldName.includes('審査単価') && section.includes('案件概要')) details.review_unit_price = num(value)
  else if (fieldName.includes('ユーザー報酬単価') || fieldName.includes('発注単価（報酬）') || fieldName.includes('発注単価(報酬)'))
    details.user_reward_unit_price = num(value)

  // 外注区分（v2: 汎用エントリ）
  else if (section.includes('YMS発注')) {
    let sub = subcontracts.find(s => s.company_name === 'YMS')
    if (!sub) { sub = { sort_order: subcontracts.length + 1, company_name: 'YMS', delegated_amount: 0, delegated_budget: 0, delegated_revenue: 0, notes: '' }; subcontracts.push(sub) }
    if (fieldName.includes('委託分予算')) { sub.delegated_budget = num(value) || 0; sub.delegated_revenue = num(value) || 0 }
    else if (fieldName.includes('YMS社お支払い') || fieldName.includes('YMS社お支払')) sub.delegated_amount = num(value) || 0
    // notesに詳細条件を追記
    if (fieldName.includes('保証再生数')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `保証再生数: ${num(value)}`
    else if (fieldName.includes('TONYAマージン')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `TONYAマージン: ${num(value)}%`
  }
  else if (section.includes('エニドア発注')) {
    let sub = subcontracts.find(s => s.company_name === 'エニドア')
    if (!sub) { sub = { sort_order: subcontracts.length + 1, company_name: 'エニドア', delegated_amount: 0, delegated_budget: 0, delegated_revenue: 0, notes: '' }; subcontracts.push(sub) }
    // エニドア: delegated_amount = その他代理店支払額相当
    if (fieldName.includes('保証再生数')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `保証再生数: ${num(value)}`
    else if (fieldName.includes('投稿数') || fieldName.includes('投稿人数')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `投稿${num(value)}人`
    else if (fieldName.includes('商品代')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `商品代${num(value)}`
    else if (fieldName.includes('審査代')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `審査代${num(value)}`
    else if (fieldName.includes('学生向け報酬')) sub.notes = (sub.notes ? sub.notes + ', ' : '') + `学生報酬${num(value)}`
  }
}

function mapActualsField(actuals: Record<string, unknown>, fieldName: string, value: unknown, rateValue: unknown) {
  if (fieldName.includes('売上') && !fieldName.includes('TONYA')) actuals.revenue = num(value)
  else if (fieldName.includes('自社参加人数')) actuals.own_participants = num(value)
  else if (fieldName.includes('エニドア参加人数')) actuals.enidoor_participants = num(value)
  else if (fieldName.includes('自社再生数')) actuals.own_views = num(value)
  else if (fieldName.includes('自社再生原価')) actuals.own_view_cost = num(value)
  else if (fieldName.includes('その他特別対応')) actuals.other_special_cost = num(value)
  else if (fieldName.includes('広告配信費')) actuals.ad_delivery_cost = num(value)
  else if (fieldName.includes('商品代原価')) actuals.product_cost = num(value)
  else if (fieldName.includes('審査原価')) actuals.review_cost = num(value)
  else if (fieldName.includes('エニドアお支払い')) actuals.enidoor_payment = num(value)
  else if (fieldName.includes('その他代理店支払い')) actuals.other_agency_payment = num(value)
  else if (fieldName.includes('YMSお支払い')) actuals.yms_payment = num(value)
  else if (fieldName.includes('粗利')) {
    actuals.gross_profit = num(value)
    actuals.gross_profit_rate = num(rateValue)
  }
}

// ============================================
// (C) 事業コスト
// ============================================

function parseCostSheet(workbook: XLSX.WorkBook, result: ImportResult) {
  const sheet = getSheet(workbook, '事業コスト')
  if (!sheet) return

  // ヘッダー行から月を取得（E列〜）
  const headerRow = sheet[2] || sheet[1] || sheet[0]
  if (!headerRow) return

  const months: (string | null)[] = []
  for (let col = 4; col < headerRow.length; col++) {
    months.push(dateToMonth(headerRow[col]))
  }

  // 固定費部分（行4〜10程度）
  for (let i = 3; i < Math.min(sheet.length, 12); i++) {
    const row = sheet[i]
    if (!row) continue
    const label = str(row[1]) || str(row[2]) || str(row[3])
    if (!label) continue

    // DM配信費はスキップ（personnel_paymentsから集計されるため）
    if (label.includes('DM配信費')) continue

    let category = 'e_guardian'
    let subcategory = label
    if (label.includes('管理費')) { category = 'e_guardian'; subcategory = '管理費' }
    else if (label.includes('審査') && !label.includes('件数')) { category = 'e_guardian'; subcategory = '審査（実費入力）' }
    else if (label.includes('審査件数')) continue // 件数行は審査費レコードのquantityに格納
    else if (label.includes('紹介制度')) { category = 'referral'; subcategory = '紹介制度' }
    else continue

    // 審査件数行を探す
    const quantityRow = (subcategory === '審査（実費入力）' && i + 1 < sheet.length)
      ? sheet[i + 1] : null
    const isQuantityRow = quantityRow && (str(quantityRow[1]) || str(quantityRow[2]) || str(quantityRow[3])).includes('件数')

    for (let col = 4; col < row.length && col - 4 < months.length; col++) {
      const month = months[col - 4]
      if (!month) continue
      const amount = num(row[col])
      if (amount == null) continue

      const fc: Record<string, unknown> = {
        cost_category: category,
        cost_subcategory: subcategory,
        target_month: month,
        amount,
        quantity: null,
        unit_price: null,
      }

      // 審査費の場合、件数行から quantity を取得
      if (isQuantityRow && quantityRow) {
        const qty = num(quantityRow[col])
        if (qty && amount > 0) {
          fc.quantity = qty
          fc.unit_price = Math.round(amount / qty)
        }
      }

      result.fixed_costs.push(fc)
    }
  }

  // 案件別コスト部分（行12〜）→ project_costs
  // これは案件ブロックパースで処理済みのため、ここではスキップ
}

// ============================================
// (D) アルバイト・インターン・DM配信（入力）
// ============================================

function parsePersonnelSheet(workbook: XLSX.WorkBook, result: ImportResult) {
  const sheet = getSheet(workbook, 'アルバイト') || getSheet(workbook, 'インターン')
  if (!sheet) return

  // ヘッダーから月を取得
  const headerRow = sheet[2] || sheet[1]
  if (!headerRow) return

  const months: (string | null)[] = []
  for (let col = 4; col < headerRow.length; col++) {
    months.push(dateToMonth(headerRow[col]))
  }

  // 人員マスター取得（行4〜11のB列）
  const personnelNames: string[] = []
  for (let i = 3; i < Math.min(sheet.length, 12); i++) {
    const row = sheet[i]
    if (!row) continue
    const name = str(row[1])
    if (name && !name.includes('合計')) {
      personnelNames.push(name)
      const role = name.includes('イベント') ? 'event' : null
      result.personnel.push({ name, role, is_active: true })
    }
  }

  // DM配信詳細ブロック（行14以降）
  let currentPerson = ''
  let currentType = ''

  for (let i = 12; i < sheet.length; i++) {
    const row = sheet[i]
    if (!row) continue
    const labelB = str(row[1])
    const labelC = str(row[2])

    // 「〇〇さん リスト」「〇〇さん 送信」等のブロック名検出
    if (labelB) {
      if (labelB.includes('リスト')) { currentPerson = labelB.replace(/リスト.*/, '').trim(); currentType = 'dm_list' }
      else if (labelB.includes('送信')) { currentPerson = labelB.replace(/送信.*/, '').trim(); currentType = 'dm_send' }
      else if (labelB.includes('固定')) { currentPerson = labelB.replace(/固定.*/, '').trim(); currentType = 'salary' }
      else { currentPerson = labelB; currentType = '' }
    }

    // 件数行
    if (labelC && labelC.includes('件数') && currentPerson && currentType) {
      for (let col = 4; col < row.length && col - 4 < months.length; col++) {
        const month = months[col - 4]
        if (!month) continue
        const quantity = num(row[col])
        // 次の行に単価・金額がある場合
        const unitPriceRow = sheet[i + 1]
        const amountRow = sheet[i + 2]
        const up = unitPriceRow ? num(unitPriceRow[col]) : null
        const amt = amountRow ? num(amountRow[col]) : null

        if (quantity != null || amt != null) {
          result.personnel_payments.push({
            personnel_name: currentPerson,
            target_month: month,
            payment_type: currentType,
            quantity: quantity,
            unit_price: up,
            amount: amt || (quantity && up ? quantity * up : 0),
          })
        }
      }
    }

    // 金額直接行（固定給等）
    if (labelC && labelC.includes('金額') && currentPerson && currentType === 'salary') {
      for (let col = 4; col < row.length && col - 4 < months.length; col++) {
        const month = months[col - 4]
        if (!month) continue
        const amt = num(row[col])
        if (amt != null && amt > 0) {
          result.personnel_payments.push({
            personnel_name: currentPerson,
            target_month: month,
            payment_type: 'salary',
            quantity: null,
            unit_price: null,
            amount: amt,
          })
        }
      }
    }
  }
}

// ============================================
// (E) インフルエンサー支払い
// ============================================

function parseInfluencerSheet(workbook: XLSX.WorkBook, result: ImportResult) {
  const sheet = getSheet(workbook, 'インフルエンサー')
  if (!sheet) return

  // ヘッダー行（行3）
  const header = sheet[2]
  if (!header) return

  // 月次列の位置を特定（L列=11, N列=13, P列=15 ...）
  const monthCols: { col: number; month: string; statusCol: number }[] = []
  for (let col = 10; col < header.length; col++) {
    const m = dateToMonth(header[col])
    if (m) {
      monthCols.push({ col, month: m, statusCol: col + 1 })
    }
  }

  // データ行（行4〜）
  for (let i = 3; i < sheet.length; i++) {
    const row = sheet[i]
    if (!row) continue
    const username = str(row[1])
    if (!username) continue

    const influencer: Record<string, unknown> = {
      number: str(row[0]) || null,
      username,
      registered_at: row[2] ? dateToMonth(row[2]) : null,
      respondent_name: str(row[3]) || null,
      line_id: str(row[4]) || null,
      bank_name: str(row[5]) || null,
      bank_branch: str(row[6]) || null,
      account_type: str(row[7]) || null,
      account_number: str(row[8]) || null,
      account_holder: str(row[9]) || null,
      is_active: true,
    }
    result.influencers.push(influencer)

    // 月次支払い
    for (const mc of monthCols) {
      const amount = num(row[mc.col])
      if (amount == null || amount === 0) continue
      const statusVal = str(row[mc.statusCol])
      result.influencer_payments.push({
        influencer_username: username,
        target_month: mc.month,
        amount,
        transfer_status: statusVal.includes('実行') ? '実行' : '未実行',
      })
    }
  }
}

// ============================================
// (F) 支払い情報
// ============================================

function parseInvoiceSheet(workbook: XLSX.WorkBook, result: ImportResult) {
  const sheet = getSheet(workbook, '支払い情報')
  if (!sheet) return

  // 上半分: 請求書送付・入金確認（行3〜16）→ direction='outgoing'
  parseInvoiceSection(sheet, 2, 16, 'outgoing', result)

  // 下半分: 請求書受取・支払い（行19〜31）→ direction='incoming'
  parseInvoiceSection(sheet, 18, 31, 'incoming', result)
}

function parseInvoiceSection(
  sheet: Sheet,
  startRow: number,
  endRow: number,
  direction: string,
  result: ImportResult,
) {
  // ヘッダーから月を特定
  const headerRow = sheet[startRow]
  if (!headerRow) return

  // 月ごとに4列セット（送付日, ファイル名, 総額, 備考）
  const monthBlocks: { month: string; startCol: number }[] = []
  for (let col = 3; col < headerRow.length; col++) {
    const m = dateToMonth(headerRow[col])
    if (m) monthBlocks.push({ month: m, startCol: col })
  }

  for (let i = startRow + 1; i <= Math.min(endRow, sheet.length - 1); i++) {
    const row = sheet[i]
    if (!row) continue
    const counterparty = str(row[2])
    if (!counterparty) continue

    for (const mb of monthBlocks) {
      const sentDate = row[mb.startCol]
      const fileName = str(row[mb.startCol + 1])
      const totalAmount = num(row[mb.startCol + 2])
      const note = str(row[mb.startCol + 3])

      if (!sentDate && !fileName && totalAmount == null) continue

      result.invoices.push({
        direction,
        counterparty,
        target_month: mb.month,
        sent_date: sentDate ? dateToMonth(sentDate) : null,
        invoice_file_name: fileName || null,
        total_amount_tax_included: totalAmount,
        note: note || null,
        payment_status: '未払い',
      })
    }
  }
}
