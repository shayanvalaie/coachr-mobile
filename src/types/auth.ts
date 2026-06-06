export const AuthMode = {
  SignIn: 'signIn',
  SignUp: 'signUp',
} as const

export type AuthMode = (typeof AuthMode)[keyof typeof AuthMode]
