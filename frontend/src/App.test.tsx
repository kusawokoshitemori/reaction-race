import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import App from './App'

afterEach(cleanup)

test('increments the counter for each click', async () => {
  const user = userEvent.setup()
  render(<App />)

  const button = screen.getByRole('button', { name: 'Count is 0' })
  await user.click(button)
  expect(button.textContent).toBe('Count is 1')
  await user.click(button)
  expect(button.textContent).toBe('Count is 2')
})
