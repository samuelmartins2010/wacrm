#!/usr/bin/env node
// Lists next-intl keys used in src/ (t('...') from useTranslations /
// getTranslations) that are missing in messages/pt-BR.json or en.json.
// Dynamic keys (template literals / variables) are counted, not checked.
// Usage: node scripts/check-i18n-keys.mjs [--json]
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const locales = ['pt-BR', 'en']
const messages = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(fs.readFileSync(path.join(root, 'messages', `${l}.json`), 'utf8'))]),
)
const has = (obj, key) =>
  key.split('.').reduce((o, k) => (o && typeof o === 'object' && k in o ? o[k] : undefined), obj) !== undefined

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p)
    return /\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}

const missing = []
const dynamic = []
for (const file of files(path.join(root, 'src'))) {
  const src = fs.readFileSync(file, 'utf8')
  if (!/useTranslations|getTranslations/.test(src)) continue
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind)
  // name -> [{ scope, ns }]: a `t` declared inside one component must not
  // be confused with another component's `t` in the same file.
  const decls = new Map()
  const nsArg = (call) => {
    const a = call.arguments[0]
    if (!a) return ''
    if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return a.text
    if (ts.isObjectLiteralExpression(a)) {
      const p = a.properties.find((x) => x.name?.getText() === 'namespace')
      if (p && ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) return p.initializer.text
      return ''
    }
    return null
  }
  const findCall = (e) => {
    while (e && (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e) || ts.isAsExpression(e))) e = e.expression
    return e && ts.isCallExpression(e) && /^(useTranslations|getTranslations)$/.test(e.expression.getText()) ? e : null
  }
  const collect = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      const c = findCall(n.initializer)
      if (c) {
        const v = nsArg(c)
        if (v !== null) {
          let scope = n.parent
          while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent
          const list = decls.get(n.name.text) ?? []
          list.push({ scope, ns: v })
          decls.set(n.name.text, list)
        }
      }
    }
    ts.forEachChild(n, collect)
  }
  collect(sf)
  if (decls.size === 0) continue
  const resolve = (id) => {
    const list = decls.get(id.text)
    if (!list) return undefined
    for (let a = id.parent; a; a = a.parent) {
      const hit = list.find((d) => d.scope === a)
      if (hit) return hit.ns
    }
    return undefined
  }
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      let callee = n.expression
      const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : null
      if (method && ['rich', 'raw', 'markup', 'has'].includes(method)) callee = callee.expression
      const base = ts.isIdentifier(callee) ? resolve(callee) : undefined
      if (base !== undefined && n.arguments[0]) {
        const a = n.arguments[0]
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        const rel = path.relative(root, file)
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          const key = base ? `${base}.${a.text}` : a.text
          const lacks = locales.filter((l) => !has(messages[l], key))
          if (lacks.length && method !== 'has') missing.push({ file: rel, line, key, locales: lacks })
        } else {
          dynamic.push({ file: rel, line, expr: a.getText() })
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ missing, dynamic }, null, 2))
} else {
  const seen = new Set()
  for (const m of missing) {
    const id = `${m.key}|${m.locales}`
    if (seen.has(id)) continue
    seen.add(id)
    console.log(`${m.key}  [falta em: ${m.locales.join(', ')}]  ${m.file}:${m.line}`)
  }
  console.log(`\n${seen.size} chave(s) faltando; ${dynamic.length} chamada(s) com chave dinâmica (não verificadas).`)
}
process.exit(missing.length ? 1 : 0)
