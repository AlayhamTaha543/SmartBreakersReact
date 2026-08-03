import { afterEach, beforeEach } from "vitest"
import { cleanup } from "@testing-library/react"
import '@testing-library/jest-dom/vitest'

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(cleanup)
