import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

function getId(req: Request) {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  return parts[parts.indexOf('exceptions') + 1] ?? null
}

export async function POST(req: Request) {
  try {
    const exceptionId = getId(req)
    if (!exceptionId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const text = String(body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: 'Empty comment' }, { status: 400 })

    const exception = await prisma.exception.findUnique({
      where: { id: exceptionId },
      select: { id: true, org_id: true },
    })
    if (!exception) return NextResponse.json({ error: 'Exception not found' }, { status: 404 })

    const comment = await prisma.exceptionComment.create({
      data: {
        exception: { connect: { id: exceptionId } },
        org_id: exception.org_id,
        user_id: user.id,
        user_email: user.email ?? null,
        text,
      },
    })

    return NextResponse.json({ success: true, comment })
  } catch (error: any) {
    console.error('[POST_COMMENT_ERROR]', error)
    return NextResponse.json({ error: error.message || 'Failed to create comment' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const exceptionId = getId(req)
    if (!exceptionId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const exception = await prisma.exception.findUnique({
      where: { id: exceptionId },
      select: { id: true },
    })
    if (!exception) return NextResponse.json({ error: 'Exception not found' }, { status: 404 })

    const comments = await prisma.exceptionComment.findMany({
      where: { exception_id: exceptionId },
      orderBy: { created_at: 'asc' },
    })

    return NextResponse.json({ success: true, comments })
  } catch (error: any) {
    console.error('[GET_COMMENTS_ERROR]', error)
    return NextResponse.json({ error: error.message || 'Failed to get comments' }, { status: 500 })
  }
}
