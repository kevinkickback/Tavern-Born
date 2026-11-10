import { getNormalizedClassChoiceId } from './classChoiceId'

type InvocationOwner = { name: string; source: string }

export function isRevisedInvocationPoolId(id: string | undefined) {
  return (
    typeof id === 'string' &&
    /^class:[a-z0-9]+(?:-[a-z0-9]+)*\|[a-z0-9]+(?:-[a-z0-9]+)*\|choice:eldritch-invocations\|1$/.test(
      id,
    )
  )
}

export function getRevisedInvocationPoolId(owner: InvocationOwner) {
  return getNormalizedClassChoiceId({ ...owner, type: 'class' }, 'Eldritch Invocations', 1)
}
