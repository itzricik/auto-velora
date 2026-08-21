import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const repository = readFileSync(new URL('../netlify/functions/_lib/repository.ts', import.meta.url), 'utf8')
const requestList = readFileSync(new URL('./components/RequestList.tsx', import.meta.url), 'utf8')

describe('admin incoming request queue', () => {
  it('includes scheduled pending requests submitted by the public website', () => {
    assert.match(repository, /status=eq\.pending&source=eq\.public_website/)
    assert.doesNotMatch(repository, /status=eq\.pending&starts_at=is\.null/)
  })

  it('describes scheduled requests as awaiting confirmation', () => {
    assert.match(requestList, /Awaiting confirmation/)
    assert.match(requestList, /Review request/)
  })
})
