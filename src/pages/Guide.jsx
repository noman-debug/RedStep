import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { STEPS } from '../content/survival.js'
import { Badge, Eyebrow, Source } from '../components/Atoms.jsx'
import { SidebarIcon } from '../components/Sidebar.jsx'
import { factSource } from '../content/sources.js'
import { WIDGETS } from '../components/guide/Widgets.jsx'
import { useStored } from '../lib/hooks.js'
import Orbits from '../components/Orbits.jsx'
import './guide.css'

function lastWalkDose() {
  try { return JSON.parse(sessionStorage.getItem('mw-brief'))?.result?.analysis?.dose ?? null } catch { return null }
}

export default function Guide() {
  const { step } = useParams()
  const navigate = useNavigate()
  const idx = Math.max(0, STEPS.findIndex((s) => s.id === step))
  const s = STEPS[idx]
  const [done, setDone] = useStored('mw-guide-done', {})
  const [answer, setAnswer] = useState(null)
  const [railOpen, setRailOpen] = useStored('mw-guide-rail', true)
  // The steps sidebar is fixed to the window; when the footer scrolls into view it stops above
  // it instead of covering it.
  useEffect(() => {
    const footer = document.querySelector('.footer')
    if (!footer) return undefined
    let raf = 0
    const place = () => {
      raf = 0
      const lift = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
      document.documentElement.style.setProperty('--rail-lift', `${lift}px`)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(place) }
    place()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
      document.documentElement.style.removeProperty('--rail-lift')
    }
  }, [])
  const head = useRef(null)
  const walkDose = useMemo(lastWalkDose, [])
  const Widget = WIDGETS[s.widget]
  const go = (id) => navigate(`/guide/${id}`)

  useEffect(() => {
    setAnswer(null)
    window.scrollTo({ top: 0 })
    head.current?.focus({ preventScroll: true })
  }, [idx])

  const choose = (i) => {
    setAnswer(i)
    if (i === s.quiz.answer) setDone((d) => ({ ...d, [s.id]: true }))
  }
  const finished = STEPS.filter((x) => x.quiz && done[x.id] === true).length

  return (
    <div className={`guide ${railOpen ? '' : 'rail-closed'}`}>
      <aside className="g-rail" aria-label="Guide steps" inert={!railOpen}>
        <div className="g-rail-top">
          <button type="button" className="sb-toggle" onClick={() => setRailOpen(false)} aria-label="Hide sidebar" title="Hide sidebar"><SidebarIcon /></button>
          <p className="g-rail-title">Survival guide</p>
        </div>
        <div className="g-rail-head">
          <p className="g-progress"><b>{finished}</b> of {STEPS.length - 1} quizzes passed</p>
          <div className="g-progress-bar"><i style={{ width: `${(finished / (STEPS.length - 1)) * 100}%` }} /></div>
        </div>
        <ol className="g-steps">
          {STEPS.map((x, i) => (
            <li key={x.id}>
              <Link to={`/guide/${x.id}`} className={`${i === idx ? 'on' : ''} ${done[x.id] ? 'done' : ''}`} aria-current={i === idx ? 'step' : undefined}>
                <span className="g-num mono">{done[x.id] ? '✓' : i + 1}</span>
                <span>{x.title}</span>
              </Link>
            </li>
          ))}
        </ol>
        {s.facts.length > 0 && (
          <details className="g-refs">
            <summary>References for this step</summary>
            <ul>
              {[...new Set(s.facts.map((f) => f.source))].map((k) => factSource(k) && <li key={k}><a href={factSource(k).url} target="_blank" rel="noreferrer">{factSource(k).title}</a></li>)}
            </ul>
          </details>
        )}
      </aside>
      <button type="button" className={`g-rail-open ${railOpen ? '' : 'show'}`} onClick={() => setRailOpen(true)} aria-label="Show sidebar" title="Show sidebar" tabIndex={railOpen ? -1 : 0}><SidebarIcon /></button>

      <article className="g-main" key={s.id}>
        <header className="g-head">
          <Eyebrow>Step {idx + 1} of {STEPS.length}</Eyebrow>
          <h1 tabIndex={-1} ref={head}>{s.title}</h1>
          <p className="g-question">{s.question}</p>
          <p className="g-lead">{s.lead}</p>
        </header>

        <section className="g-widget" aria-label="Try it">
          <p className="micro g-try">Try it</p>
          {Widget && <Widget walkDose={walkDose} goTo={go} />}
        </section>

        {(s.facts.length > 0 || s.procedure.length > 0) && (
          <details className="g-more">
            <summary><span>Read the facts and the steps</span><i aria-hidden="true" /></summary>
          <div className="g-two">
            {s.facts.length > 0 && (
              <section className="g-facts">
                <h2 className="micro">What we know <Badge kind="nasa" /></h2>
                <ul>
                  {s.facts.map((f) => <li key={f.text}>{f.text} <Source k={f.source} badge="nasa" /></li>)}
                </ul>
              </section>
            )}
            {s.procedure.length > 0 && (
              <section className="g-proc">
                <h2 className="micro">What you would do</h2>
                <p className="g-hypo">Proposed, never tested on Mars.</p>
                <ol>
                  {s.procedure.map((p) => <li key={p}>{p}</li>)}
                </ol>
              </section>
            )}
          </div>
          </details>
        )}

        {s.quiz && (
          <section className="g-quiz" aria-labelledby="quiz-q">
            <p className="micro">Quick check</p>
            <p id="quiz-q" className="g-quiz-q">{s.quiz.q}</p>
            <div className="g-quiz-opts" role="group" aria-labelledby="quiz-q">
              {s.quiz.options.map((o, i) => (
                <button key={o} type="button" onClick={() => choose(i)} className={answer === null ? '' : i === s.quiz.answer ? 'ok' : answer === i ? 'bad' : 'dim'} aria-pressed={answer === i}>{o}</button>
              ))}
            </div>
            <p className="g-quiz-say" aria-live="polite">
              {answer === null ? '' : answer === s.quiz.answer ? 'Correct. Step passed.' : 'Not quite. The right answer is highlighted.'}
            </p>
          </section>
        )}

        <nav className="g-nav" aria-label="Guide navigation">
          {idx > 0 ? <Link to={`/guide/${STEPS[idx - 1].id}`} className="btn">← {STEPS[idx - 1].title}</Link> : <span />}
          {idx < STEPS.length - 1
            ? <Link to={`/guide/${STEPS[idx + 1].id}`} className="btn btn-primary">Next: {STEPS[idx + 1].title} <span className="arrow">→</span></Link>
            : <Link to="/site/jezero" className="btn btn-primary">Plan a Marswalk <span className="arrow">→</span></Link>}
        </nav>
      </article>
      <Orbits className="g-orbits" />
    </div>
  )
}
