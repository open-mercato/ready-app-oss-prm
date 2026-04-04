'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function NotificationsPage() {
  const searchParams = useSearchParams()
  const notificationId = searchParams.get('notificationId')

  useEffect(() => {
    const bell = document.querySelector<HTMLButtonElement>(
      '[aria-label*="notification" i], [aria-label*="Notification" i]'
    )
    if (bell) bell.click()
  }, [notificationId])

  return null
}
