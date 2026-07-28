import { describe, expect, it } from 'vitest'
import { normalizeJobUrl } from '../job-url'

describe('normalizeJobUrl', () => {
  it('passes through full https URLs', () => {
    const u = normalizeJobUrl('https://uk.indeed.com/viewjob?jk=abc')
    expect(u?.href).toBe('https://uk.indeed.com/viewjob?jk=abc')
  })

  it('prepends https:// for bare hosts', () => {
    const u = normalizeJobUrl('www.indeed.com/viewjob?jk=abc')
    expect(u?.href).toBe('https://www.indeed.com/viewjob?jk=abc')
  })

  it('accepts LinkedIn, Reed, Greenhouse, and company boards', () => {
    expect(normalizeJobUrl('linkedin.com/jobs/view/123')?.hostname).toBe('linkedin.com')
    expect(normalizeJobUrl('https://www.reed.co.uk/jobs/x/1')?.hostname).toBe('www.reed.co.uk')
    expect(normalizeJobUrl('boards.greenhouse.io/acme/jobs/1')?.hostname).toBe('boards.greenhouse.io')
  })

  it('rejects empty, non-http schemes, and non-host strings', () => {
    expect(normalizeJobUrl('')).toBeNull()
    expect(normalizeJobUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeJobUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeJobUrl('not a url')).toBeNull()
    expect(normalizeJobUrl('localhost/job')).toBeNull()
  })
})
