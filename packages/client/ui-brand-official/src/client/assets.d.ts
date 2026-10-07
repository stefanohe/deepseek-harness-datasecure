/** Brand artwork imports are embedded in the brand client bundle. */
declare module '*.png' {
  const url: string
  export default url
}
declare module '*.gif' {
  const url: string
  export default url
}
