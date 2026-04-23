import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { parseExcel } from '@/lib/excel-parser'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'ファイルが指定されていません' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })

    const result = parseExcel(workbook)

    const summary: Record<string, { imported: number; errors: number }> = {}

    if (result.projects.length > 0)
      summary.projects = { imported: result.projects.length, errors: 0 }
    if (result.project_details.length > 0)
      summary.project_details = { imported: result.project_details.length, errors: 0 }
    if (result.project_costs.length > 0)
      summary.project_costs = { imported: result.project_costs.length, errors: 0 }
    if (result.project_subcontracts.length > 0)
      summary.project_subcontracts = { imported: result.project_subcontracts.length, errors: 0 }
    if (result.project_actuals.length > 0)
      summary.project_actuals = { imported: result.project_actuals.length, errors: 0 }
    if (result.fixed_costs.length > 0)
      summary.fixed_costs = { imported: result.fixed_costs.length, errors: 0 }
    if (result.personnel.length > 0)
      summary.personnel = { imported: result.personnel.length, errors: 0 }
    if (result.personnel_payments.length > 0)
      summary.personnel_payments = { imported: result.personnel_payments.length, errors: 0 }
    if (result.influencers.length > 0)
      summary.influencers = { imported: result.influencers.length, errors: 0 }
    if (result.influencer_payments.length > 0)
      summary.influencer_payments = { imported: result.influencer_payments.length, errors: 0 }
    if (result.invoices.length > 0)
      summary.invoices = { imported: result.invoices.length, errors: 0 }

    return NextResponse.json({
      success: true,
      sheets_found: workbook.SheetNames,
      summary,
      errors: result.errors,
      data: result,
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'インポートに失敗しました', details: String(error) },
      { status: 500 }
    )
  }
}
