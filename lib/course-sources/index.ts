import { curatedCourseSource } from '@/lib/course-sources/curated'
import { microsoftLearnSource } from '@/lib/course-sources/microsoft-learn'
import { youtubeCourseSource } from '@/lib/course-sources/youtube'
import type { CourseSource, CourseSourceRecord } from '@/lib/course-sources/types'

export { COURSE_PROVIDERS, ALLOWED_COURSE_DOMAINS } from '@/lib/course-sources/registry'
export type {
  CourseAccessType,
  CourseLevel,
  CourseSource,
  CourseSourceRecord,
} from '@/lib/course-sources/types'

export const COURSE_SOURCES: readonly CourseSource[] = [
  curatedCourseSource,
  microsoftLearnSource,
  youtubeCourseSource,
]

export interface CourseSourceCollection {
  source: string
  records: CourseSourceRecord[]
  error: string | null
}

export async function collectCourseSources(): Promise<CourseSourceCollection[]> {
  const enabled = COURSE_SOURCES.filter((source) => source.enabled())
  const settled = await Promise.allSettled(enabled.map((source) => source.collect()))
  return settled.map((result, index) => ({
    source: enabled[index].id,
    records: result.status === 'fulfilled' ? result.value : [],
    error: result.status === 'rejected'
      ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
      : null,
  }))
}
