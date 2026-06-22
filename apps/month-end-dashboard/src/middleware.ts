import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Refreshes the auth token if expired — this avoids a slow
    // round-trip inside getUser() on each page's server component.
    // IMPORTANT: do NOT use getSession() — it doesn't validate the JWT.
    await supabase.auth.getUser()

    return supabaseResponse
}

export const config = {
    matcher: [
        // Match all routes except static files, images, and api routes
        '/((?!_next/static|_next/image|favicon.ico|api|auth).*)',
    ],
}
