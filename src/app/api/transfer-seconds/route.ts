import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

// Create admin client using service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Admin FIDs that are authorized to trigger transfers
const ADMIN_FIDS = [250704, 1107084]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { winnerAddress, amount, adminFid, idempotencyKey } = body

    // Validate required fields
    if (!winnerAddress || !amount || !adminFid) {
      return NextResponse.json(
        { error: 'Missing required fields: winnerAddress, amount, adminFid' },
        { status: 400 }
      )
    }

    // Validate admin FID
    if (!ADMIN_FIDS.includes(adminFid)) {
      console.error('Unauthorized transfer attempt', { adminFid, winnerAddress, amount })
      return NextResponse.json(
        { error: 'Unauthorized: Invalid admin FID' },
        { status: 403 }
      )
    }

    // Validate amount
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount: must be a positive number' },
        { status: 400 }
      )
    }

    // Generate idempotency key if not provided
    const transferIdempotencyKey = idempotencyKey || `${winnerAddress}-${amountNum}-${Date.now()}`

    // Check for existing transfer with same idempotency key
    const { data: existingTransfer } = await supabaseAdmin
      .from('token_transfers')
      .select('*')
      .eq('idempotency_key', transferIdempotencyKey)
      .single()

    if (existingTransfer) {
      return NextResponse.json({
        success: true,
        message: 'Already processed',
        transfer: existingTransfer
      })
    }

    // Insert pending transfer record
    const { data: transfer, error: insertError } = await supabaseAdmin
      .from('token_transfers')
      .insert({
        winner_address: winnerAddress,
        amount: amountNum,
        admin_fid: adminFid,
        status: 'pending',
        idempotency_key: transferIdempotencyKey
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create transfer record:', insertError)
      return NextResponse.json(
        { error: 'Failed to create transfer record' },
        { status: 500 }
      )
    }

    // In a real implementation, trigger background job for on-chain transfer
    // For now, we'll simulate it and mark as completed
    setTimeout(async () => {
      try {
        const simulatedTxHash = `0x${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
        
        await supabaseAdmin
          .from('token_transfers')
          .update({
            status: 'success',
            tx_hash: simulatedTxHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.id)
          
        console.log(`✅ Transfer completed: ${transfer.id}`, { txHash: simulatedTxHash })
      } catch (error) {
        console.error('Failed to complete transfer:', error)
        
        await supabaseAdmin
          .from('token_transfers')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.id)
      }
    }, 2000) // Simulate 2 second processing time

    console.log(`🪙 Transfer initiated:`, {
      id: transfer.id,
      winnerAddress,
      amount: amountNum,
      adminFid,
      idempotencyKey: transferIdempotencyKey
    })

    return NextResponse.json({
      success: true,
      transfer,
      message: 'Transfer initiated successfully'
    })

  } catch (error) {
    console.error('Transfer error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error during transfer' },
      { status: 500 }
    )
  }
}

// GET endpoint to check transfer status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const idempotencyKey = searchParams.get('idempotencyKey')
    const transferId = searchParams.get('transferId')

    if (!idempotencyKey && !transferId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: idempotencyKey or transferId' },
        { status: 400 }
      )
    }

    let query = supabaseAdmin
      .from('token_transfers')
      .select('*')

    if (idempotencyKey) {
      query = query.eq('idempotency_key', idempotencyKey)
    } else if (transferId) {
      query = query.eq('id', transferId)
    }

    const { data: transfer, error } = await query.single()

    if (error || !transfer) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      transfer: {
        id: transfer.id,
        winnerAddress: transfer.winner_address,
        amount: transfer.amount,
        adminFid: transfer.admin_fid,
        status: transfer.status,
        txHash: transfer.tx_hash,
        createdAt: transfer.created_at,
        updatedAt: transfer.updated_at
      }
    })

  } catch (error) {
    console.error('Transfer status check error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}