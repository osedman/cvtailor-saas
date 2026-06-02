import { NextRequest } from 'next/server'
import { anthropic, SYSTEM_PROMPT, TAILOR_TOOL } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Parse + validate input
  const { cv, jobDescription } = await req.json()

  if (!cv || !jobDescription) {
    return new Response(JSON.stringify({ error: 'Both cv and jobDescription are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  if (cv.length > 20_000 || jobDescription.length > 10_000) {
    return new Response(JSON.stringify({ error: 'Input too long. CV max 20,000 chars, job description max 10,000.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Stream Claude response — keeps connection alive, prevents Vercel timeout
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        send({ status: 'analysing' })

        let toolInputAccumulator = ''

        const anthropicStream = anthropic.messages.stream(
          {
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            system: [
              {
                type: 'text',
                text: SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
              },
            ],
            tools: [TAILOR_TOOL],
            tool_choice: { type: 'tool', name: 'submit_tailored_result' },
            messages: [
              {
                role: 'user',
                content: `Here is my current CV:\n\n${cv}\n\n---\n\nHere is the job description I'm targeting:\n\n${jobDescription}`,
              },
            ],
          },
          { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
        )

        // Progress milestones based on token count
        let lastMilestone = 0
        const milestones = [
          { tokens: 500,  status: 'rewriting' },
          { tokens: 2000, status: 'refining' },
          { tokens: 4000, status: 'finishing' },
        ]

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
            toolInputAccumulator += event.delta.partial_json

            // Send progress milestones
            const approxTokens = toolInputAccumulator.length / 4
            for (const m of milestones) {
              if (approxTokens >= m.tokens && lastMilestone < m.tokens) {
                lastMilestone = m.tokens
                send({ status: m.status })
                break
              }
            }
          }
        }

        // Parse the complete tool input
        const result = JSON.parse(toolInputAccumulator)

        // Increment usage (fire-and-forget)
        supabase.rpc('increment_tailors_used', { user_id: user.id }).then(() => {})

        send({ status: 'done', result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[tailor] error:', msg)
        send({ status: 'error', error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
