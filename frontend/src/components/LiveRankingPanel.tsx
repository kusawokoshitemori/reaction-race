import type { Ref } from 'react'
import { isRanking, useRecords } from '../records'
import type { ReaderUser } from '../records'
import RankingPanel from './RankingPanel'
export default function LiveRankingPanel({
  user,
  guest,
  headingRef,
}: {
  user: ReaderUser
  guest: boolean
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const { data, error, retry } = useRecords(user, '/api/ranking', isRanking)
  return (
    <RankingPanel
      headingRef={headingRef}
      state={
        error
          ? { status: 'error', message: error }
          : data
            ? { status: 'success', entries: data }
            : { status: 'loading' }
      }
      currentPlayerId={
        guest ? null : (data?.find((e) => e.self)?.id ?? 'outside-ranking')
      }
      onRetry={retry}
    />
  )
}
