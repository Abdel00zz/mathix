//! Interactive Quiz & Concours Engine (#/eleve/:classId/quiz/... and #/eleve/:classId/concours/...).
//! Uses native Mathix exercise.css classes (#quiz, .quiz-bar, .quiz-sheets, .quiz-sheet, .opts, .opt, .why, .end).

use serde_json::Value;

use crate::html::{dir_of_path, esc, esc_attr, fmt_pct, fmt_time, icon};
use crate::math_html::{render_inline_title, render_math, render_math_inline, wrap_with_media};

pub const QUESTION_TIME_LIMIT: u64 = 45;

#[derive(Clone, Debug)]
pub struct QuizAnswerRecord {
    pub question_idx: usize,
    pub prompt: String,
    pub correct: bool,
    pub explanation: String,
}

#[derive(Clone, Debug, Default)]
pub struct QuizState {
    pub class_id: String,
    pub chapter_id: String,
    pub title: String,
    pub is_concours: bool,
    pub school_id: String,
    pub mode: String,
    pub all_questions: Vec<Value>,
    pub questions: Vec<Value>,
    pub current_idx: usize,
    pub selected_choice: Option<usize>,
    pub input_value: String,
    pub order_items: Vec<usize>,
    pub submitted: bool,
    pub last_correct: bool,
    pub last_feedback_hint: Option<String>,
    pub hint_revealed: bool,
    pub finished: bool,
    pub score: usize,
    pub time_left: u64,
    pub time_limit: u64,
    pub total_elapsed: u64,
    pub history: Vec<QuizAnswerRecord>,
    pub base_dir: String,
}

impl QuizState {
    pub fn set_source_path(&mut self, path: &str) {
        self.base_dir = dir_of_path(path);
    }
    pub fn init_from_doc(
        &mut self,
        class_id: &str,
        chapter_id: &str,
        doc: &Value,
        is_concours: bool,
        school_id: &str,
        mode: &str,
    ) {
        self.init_from_doc_with_opts(
            class_id,
            chapter_id,
            doc,
            is_concours,
            school_id,
            mode,
            None,
            None,
            true,
        );
    }

    pub fn init_from_doc_with_opts(
        &mut self,
        class_id: &str,
        chapter_id: &str,
        doc: &Value,
        is_concours: bool,
        school_id: &str,
        mode: &str,
        fallback_title: Option<&str>,
        time_per_question: Option<u64>,
        cap_concours_bank: bool,
    ) {
        self.class_id = class_id.to_string();
        self.chapter_id = chapter_id.to_string();
        self.is_concours = is_concours;
        self.school_id = school_id.to_string();
        self.mode = mode.to_string();
        self.time_limit = time_per_question.filter(|&t| t > 0).unwrap_or(QUESTION_TIME_LIMIT);
        self.title = doc["title"]
            .as_str()
            .or_else(|| doc["header"]["title"].as_str())
            .filter(|s| !s.trim().is_empty())
            .or(fallback_title)
            .unwrap_or("Quiz interactif")
            .to_string();
        let qs = doc["questions"].as_array().cloned().unwrap_or_default();
        self.questions = if is_concours && cap_concours_bank {
            let cap = if mode == "simulation" { 20 } else { 10 };
            qs.into_iter().take(cap).collect()
        } else {
            qs
        };
        self.all_questions = self.questions.clone();
        self.current_idx = 0;
        self.score = 0;
        self.finished = false;
        self.total_elapsed = 0;
        self.history.clear();
        self.prepare_current_question();
    }

    pub fn restart_full(&mut self) {
        if !self.all_questions.is_empty() {
            self.questions = self.all_questions.clone();
        }
        self.current_idx = 0;
        self.score = 0;
        self.finished = false;
        self.total_elapsed = 0;
        self.history.clear();
        self.prepare_current_question();
    }

    pub fn retry_wrong_only(&mut self) -> usize {
        let missed: Vec<Value> = self
            .history
            .iter()
            .filter(|rec| !rec.correct)
            .filter_map(|rec| self.questions.get(rec.question_idx).cloned())
            .collect();
        let count = missed.len();
        if count == 0 {
            return 0;
        }
        self.questions = missed;
        self.current_idx = 0;
        self.score = 0;
        self.finished = false;
        self.total_elapsed = 0;
        self.history.clear();
        self.prepare_current_question();
        count
    }

    pub fn prepare_current_question(&mut self) {
        self.selected_choice = None;
        self.input_value.clear();
        self.submitted = false;
        self.last_correct = false;
        self.last_feedback_hint = None;
        self.hint_revealed = false;
        self.time_left = if self.time_limit > 0 { self.time_limit } else { QUESTION_TIME_LIMIT };
        self.order_items.clear();
        if let Some(q) = self.questions.get(self.current_idx) {
            if let Some(items) = q.get("items").or_else(|| q.get("steps")).and_then(Value::as_array) {
                self.order_items = (0..items.len()).collect();
                if self.order_items.len() > 1 {
                    self.order_items.rotate_left(1);
                }
            }
        }
    }

    pub fn resolve_mcq_correct_idx(q: &Value) -> Option<usize> {
        if let Some(ci) = q["correctIndex"]
            .as_u64()
            .or_else(|| q["answerIndex"].as_u64())
            .or_else(|| q["correct"].as_u64())
            .or_else(|| q["answer"].as_u64())
            .map(|n| n as usize)
        {
            return Some(ci);
        }
        let opts = q["options"]
            .as_array()
            .or_else(|| q["choices"].as_array())
            .or_else(|| q["lines"].as_array())?;
        if let Some(idx) = opts.iter().position(|o| {
            o["isCorrect"].as_bool() == Some(true) || o["correct"].as_bool() == Some(true)
        }) {
            return Some(idx);
        }
        if let Some(ans_str) = q["answer"].as_str().or_else(|| q["correctAnswer"].as_str()) {
            let ans_norm = math_engine::answer::norm_answer(ans_str);
            return opts.iter().position(|o| {
                let txt = o.as_str().or_else(|| o["text"].as_str()).unwrap_or("");
                let oid = o["id"].as_str().unwrap_or("");
                (!txt.is_empty() && math_engine::answer::norm_answer(txt) == ans_norm)
                    || (!oid.is_empty() && oid.eq_ignore_ascii_case(ans_str.trim()))
            });
        }
        None
    }

    pub fn current_q(&self) -> Option<&Value> {
        self.questions.get(self.current_idx)
    }

    pub fn question_type(q: &Value) -> &str {
        if let Some(t) = q["type"].as_str() {
            return match t {
                "bool" | "boolean" | "true_false" | "true-false" | "vrai_faux" | "vrai-faux" => "boolean",
                "order" | "ordering" | "sort" => "order",
                "error" | "spot_error" | "spot-error" => "error",
                "input" | "text" | "short" | "open" => "input",
                _ => "mcq",
            };
        }
        if q["options"].is_array() || q["choices"].is_array() {
            "mcq"
        } else if q["items"].is_array() || q["steps"].is_array() {
            "order"
        } else if q["answer"].is_boolean() || q["correctAnswer"].is_boolean() {
            "boolean"
        } else {
            "input"
        }
    }

    pub fn evaluate_current(&mut self) -> bool {
        if self.submitted {
            return self.last_correct;
        }
        let Some(q) = self.questions.get(self.current_idx).cloned() else {
            return false;
        };
        let qtype = Self::question_type(&q);
        let is_correct = match qtype {
            "mcq" | "error" => {
                if let Some(ci) = Self::resolve_mcq_correct_idx(&q) {
                    self.selected_choice == Some(ci)
                } else {
                    false
                }
            }
            "boolean" => {
                let expected = q["isTrue"]
                    .as_bool()
                    .or_else(|| q["correct"].as_bool())
                    .or_else(|| q["answer"].as_bool())
                    .or_else(|| q["correctAnswer"].as_bool())
                    .unwrap_or(true);
                let expected_idx = if expected { 0 } else { 1 };
                self.selected_choice == Some(expected_idx)
            }
            "order" => {
                let items_len = q["items"].as_array().or_else(|| q["steps"].as_array()).map(|a| a.len()).unwrap_or(0);
                let expected: Vec<usize> = q["correctOrder"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_u64().map(|n| n as usize)).collect())
                    .unwrap_or_else(|| (0..items_len).collect());
                self.order_items == expected
            }
            "input" => {
                let trimmed = self.input_value.trim();
                if trimmed.is_empty() {
                    false
                } else {
                    let mut candidates: Vec<&str> = Vec::new();
                    if let Some(s) = q["answer"].as_str().or_else(|| q["correctAnswer"].as_str()) {
                        candidates.push(s);
                    }
                    if let Some(arr) = q.get("acceptedAnswers").or_else(|| q.get("answers")).and_then(Value::as_array) {
                        for v in arr {
                            if let Some(s) = v.as_str() {
                                candidates.push(s);
                            }
                        }
                    }
                    let mut exact = false;
                    let mut sign_err = false;
                    let mut near_num = false;
                    for cand in candidates {
                        match math_engine::answer::check_math_answer(trimmed, cand) {
                            math_engine::answer::AnswerMatch::Exact => {
                                exact = true;
                                break;
                            }
                            math_engine::answer::AnswerMatch::SignError => {
                                sign_err = true;
                            }
                            math_engine::answer::AnswerMatch::NearNumeric => {
                                near_num = true;
                            }
                            math_engine::answer::AnswerMatch::Mismatch => {}
                        }
                    }
                    if !exact {
                        if sign_err {
                            self.last_feedback_hint = Some("Attention au signe !".into());
                        } else if near_num {
                            self.last_feedback_hint = Some("Presque ! Vérifiez l’arrondi ou la fraction exacte.".into());
                        }
                    }
                    exact
                }
            }
            _ => false,
        };

        self.submitted = true;
        self.last_correct = is_correct;
        if is_correct {
            self.score += 1;
        }
        let prompt = q["prompt"]
            .as_str()
            .or_else(|| q["question"].as_str())
            .or_else(|| q["statement"].as_str())
            .unwrap_or("")
            .to_string();
        let explanation = q["explanation"]
            .as_str()
            .or_else(|| q["correction"].as_str())
            .unwrap_or("")
            .to_string();
        self.history.push(QuizAnswerRecord {
            question_idx: self.current_idx,
            prompt,
            correct: is_correct,
            explanation,
        });
        is_correct
    }

    pub fn advance(&mut self) -> bool {
        if self.current_idx + 1 >= self.questions.len() {
            self.finished = true;
            true
        } else {
            self.current_idx += 1;
            self.prepare_current_question();
            false
        }
    }
}

pub fn render_quiz_view(st: &QuizState, is_dark: bool, root_prefix: &str) -> String {
    let back_href = if st.is_concours {
        format!("#/eleve/{}?tab=concours", esc_attr(&st.class_id))
    } else {
        format!("#/eleve/{}", esc_attr(&st.class_id))
    };

    if st.questions.is_empty() {
        return format!(
            r##"<main class="page-main page-main--quiz" id="quiz"><div class="empty">{}<div>Aucune question dans ce quiz.</div><a class="btn sm" href="{back_href}">Retour</a></div></main>"##,
            icon("square-root", 26, "")
        );
    }

    if st.finished {
        return render_quiz_results(st, &back_href);
    }

    let q = &st.questions[st.current_idx];
    let qtype = QuizState::question_type(q);
    let total = st.questions.len();
    let idx = st.current_idx;
    let ratio = ((idx + if st.submitted { 1 } else { 0 }) as f64) / (total as f64);

    let prompt = q["prompt"]
        .as_str()
        .or_else(|| q["question"].as_str())
        .or_else(|| q["statement"].as_str())
        .unwrap_or("");
    let explanation = q["explanation"]
        .as_str()
        .or_else(|| q["correction"].as_str())
        .unwrap_or("");

    let body_html = match qtype {
        "mcq" | "error" => {
            let opts = q["options"]
                .as_array()
                .or_else(|| q["choices"].as_array())
                .or_else(|| q["lines"].as_array())
                .cloned()
                .unwrap_or_default();
            let correct_idx = QuizState::resolve_mcq_correct_idx(q);
            let letters = ["A", "B", "C", "D", "E", "F"];
            let btns: String = opts
                .iter()
                .enumerate()
                .map(|(oi, opt)| {
                    let txt = opt.as_str().or_else(|| opt["text"].as_str()).unwrap_or("");
                    let letter = letters.get(oi).copied().unwrap_or("?");
                    let mut cls = String::from("opt");
                    let mut tag = "";
                    if !st.submitted {
                        if st.selected_choice == Some(oi) {
                            cls.push_str(" sel");
                        }
                    } else if Some(oi) == correct_idx {
                        cls.push_str(" ok");
                        tag = "<em>✓ Bonne réponse</em>";
                    } else if st.selected_choice == Some(oi) {
                        cls.push_str(" bad");
                        tag = "<em>✗ Votre choix</em>";
                    } else {
                        cls.push_str(" dim");
                    }
                    format!(
                        r##"<button type="button" class="{cls}" data-action="quiz-pick" data-idx="{oi}"{dis}>
                          <b>{letter}</b>
                          <span class="opt-tx">{}</span>
                          {tag}
                        </button>"##,
                        render_math_inline(txt),
                        dis = if st.submitted { " disabled" } else { "" },
                    )
                })
                .collect();
            format!(r##"<div class="opts">{btns}</div>"##)
        }
        "boolean" => {
            let expected = q["isTrue"]
                .as_bool()
                .or_else(|| q["correct"].as_bool())
                .or_else(|| q["answer"].as_bool())
                .or_else(|| q["correctAnswer"].as_bool())
                .unwrap_or(true);
            let exp_idx = if expected { 0 } else { 1 };
            let labels = [("Vrai", "A"), ("Faux", "B")];
            let btns: String = labels
                .iter()
                .enumerate()
                .map(|(oi, (lbl, k))| {
                    let mut cls = String::from("opt");
                    let mut tag = "";
                    if !st.submitted {
                        if st.selected_choice == Some(oi) { cls.push_str(" sel"); }
                    } else if oi == exp_idx {
                        cls.push_str(" ok");
                        tag = "<em>✓</em>";
                    } else if st.selected_choice == Some(oi) {
                        cls.push_str(" bad");
                        tag = "<em>✗</em>";
                    } else {
                        cls.push_str(" dim");
                    }
                    format!(
                        r##"<button type="button" class="{cls}" data-action="quiz-pick" data-idx="{oi}"{dis}>
                          <b>{k}</b>
                          <span class="opt-tx">{lbl}</span>
                          {tag}
                        </button>"##,
                        dis = if st.submitted { " disabled" } else { "" },
                    )
                })
                .collect();
            format!(r##"<div class="opts">{btns}</div>"##)
        }
        "order" => {
            let items = q["items"].as_array().or_else(|| q["steps"].as_array()).cloned().unwrap_or_default();
            let rows: String = st
                .order_items
                .iter()
                .enumerate()
                .map(|(pos, &orig_idx)| {
                    let txt = items.get(orig_idx).and_then(|v| v.as_str().or_else(|| v["text"].as_str())).unwrap_or("");
                    format!(
                        r##"<div class="opt" style="cursor:default">
                          <b>{}</b>
                          <span class="opt-tx">{}</span>
                          <span style="display:inline-flex;gap:4px">
                            <button type="button" class="ib" data-action="quiz-move" data-pos="{pos}" data-dir="-1"{up_dis} aria-label="Monter">{ico_u}</button>
                            <button type="button" class="ib" data-action="quiz-move" data-pos="{pos}" data-dir="1"{dn_dis} aria-label="Descendre">{ico_d}</button>
                          </span>
                        </div>"##,
                        pos + 1,
                        render_math_inline(txt),
                        up_dis = if st.submitted || pos == 0 { " disabled" } else { "" },
                        dn_dis = if st.submitted || pos + 1 >= st.order_items.len() { " disabled" } else { "" },
                        ico_u = icon("chevron-up", 15, ""),
                        ico_d = icon("chevron-down", 15, ""),
                    )
                })
                .collect();
            format!(r##"<div class="opts">{rows}</div>"##)
        }
        _ => {
            format!(
                r##"<label class="quiz-input-fld">Votre réponse
                  <input type="text" id="quiz-input" data-action="quiz-input" value="{val}" placeholder="Saisissez votre réponse…" autocomplete="off"{dis} />
                </label>"##,
                val = esc_attr(&st.input_value),
                dis = if st.submitted { " disabled" } else { "" },
            )
        }
    };

    let can_submit = match qtype {
        "input" => !st.input_value.trim().is_empty(),
        "order" => true,
        _ => st.selected_choice.is_some(),
    };

    let q_hint = q["hint"]
        .as_str()
        .or_else(|| q["tip"].as_str())
        .or_else(|| q["indication"].as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let hint_box_html = if !st.submitted && st.hint_revealed {
        if let Some(h) = q_hint {
            format!(r##"<div class="why quiz-hint-box"><strong>Indice</strong><div>{}</div></div>"##, render_math(h))
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let hint_btn_html = if !st.submitted && !st.hint_revealed && q_hint.is_some() {
        r##"<button type="button" class="btn sm" data-action="quiz-hint">Indice</button>"##
    } else {
        ""
    };

    let feedback_html = if st.submitted {
        let cls = if st.last_correct { "why why--ok" } else { "why" };
        let head = if st.last_correct { "Bonne réponse !" } else { "Réponse incorrecte" };
        let diag_html = match st.last_feedback_hint.as_deref() {
            Some(h) if !h.is_empty() => format!(r##"<div class="quiz-diag-hint"><strong>Piste :</strong> {}</div>"##, esc(h)),
            _ => String::new(),
        };
        let exp_html = if !explanation.is_empty() {
            format!(r##"<div>{}</div>"##, render_math(explanation))
        } else {
            String::new()
        };
        format!(r##"<div class="{cls}"><strong>{head}</strong>{diag_html}{exp_html}</div>"##)
    } else {
        String::new()
    };

    let cta_btn = if st.submitted {
        let lbl = if idx + 1 >= total { "Voir les résultats" } else { "Question suivante →" };
        format!(r##"<button type="button" class="quiz-val" data-action="quiz-next">{lbl}</button>"##)
    } else {
        format!(
            r##"<button type="button" class="quiz-val" data-action="quiz-submit"{dis}>Valider</button>"##,
            dis = if can_submit { "" } else { " disabled" }
        )
    };

    let urgent_time = st.time_left <= 10 && !st.submitted;

    let prompt_h2 = format!(r##"<h2 class="qt">{}</h2>"##, render_math(prompt));
    let prompt_wrapped = wrap_with_media(&q["media"], &prompt_h2, "quiz", "default", &st.base_dir, root_prefix);

    format!(
        r##"<main class="page-main page-main--quiz" id="quiz">
          <header class="quiz-bar no-print">
            <div class="quiz-bar__in">
              <a class="quiz-ib" href="{back_href}" aria-label="Quitter le quiz" title="Quitter">{ico_x}</a>
              <span class="quiz-chrono quiz-ico{urg_cls}" id="quiz-timer">{tm}</span>
              <span class="quiz-bar__title">{title_html}</span>
              <span class="quiz-bar__cnt">{} / {total}</span>
              <button type="button" class="quiz-ib" data-action="toggle-theme" data-theme-toggle="1" aria-label="{th_lbl}" title="{th_lbl}"><span data-theme-icon="1">{ico_th}</span></button>
            </div>
            <div id="quiz-prog" style="transform:scaleX({ratio:.3})"></div>
          </header>

          <div class="quiz-sheets">
            <section class="quiz-sheet">
              <header class="quiz-sheet-head">
                <div class="exo-title-badge">
                  <span class="exo-badge-label"><i class="exo-badge-dot" aria-hidden="true"></i>Question</span>
                  <span class="exo-badge-num">{:02} / {:02}</span>
                </div>
              </header>
              <div class="quiz-prompt-wrap">
                {prompt_wrapped}
              </div>
              {body_html}
              {hint_box_html}
              {feedback_html}
              <footer class="quiz-foot no-print">
                <span class="quiz-sub-hint" style="margin:0">Raccourcis : A–D · Entrée</span>
                <div style="display:inline-flex;gap:8px;align-items:center">
                  {hint_btn_html}
                  {cta_btn}
                </div>
              </footer>
            </section>
          </div>
        </main>"##,
        idx + 1,
        idx + 1,
        total,
        ico_x = icon("xmark", 18, ""),
        urg_cls = if urgent_time { " is-urgent" } else { "" },
        tm = fmt_time(st.time_left),
        title_html = render_inline_title(&st.title),
        th_lbl = if is_dark { "Mode clair (Maj+D)" } else { "Mode sombre (Maj+D)" },
        ico_th = icon(if is_dark { "sun" } else { "moon" }, 16, ""),
    )
}

fn render_quiz_results(st: &QuizState, back_href: &str) -> String {
    let total = st.questions.len().max(1);
    let pct_num = ((st.score * 100) / total) as u64;
    let pct_f = (st.score as f64 * 100.0) / (total as f64);
    let headline = if pct_f >= 80.0 {
        "Excellent travail !"
    } else if pct_f >= 50.0 {
        "Bon résultat, continuez !"
    } else {
        "À retravailler avec la fiche"
    };

    let review: String = st
        .history
        .iter()
        .enumerate()
        .map(|(i, rec)| {
            format!(
                r##"<div class="quiz-review-item {cls}">
                  <span>{ico}</span>
                  <div style="flex:1;min-width:0">
                    <div><strong>Q{}</strong> · {}</div>
                    {exp}
                  </div>
                </div>"##,
                i + 1,
                render_math_inline(&rec.prompt),
                cls = if rec.correct { "is-good" } else { "is-bad" },
                ico = icon(if rec.correct { "circle-check" } else { "circle-xmark" }, 16, ""),
                exp = if rec.explanation.is_empty() {
                    String::new()
                } else {
                    format!(r##"<div style="margin-top:4px;color:var(--muted)">{}</div>"##, render_math(&rec.explanation))
                }
            )
        })
        .collect();

    let wrong_count = st.history.iter().filter(|r| !r.correct).count();
    let retry_wrong_btn = if wrong_count > 0 {
        format!(
            r##"<button type="button" class="btn primary" data-action="quiz-retry-wrong">Retravailler mes erreurs ({wrong_count})</button>"##
        )
    } else {
        String::new()
    };

    let ex_link = if !st.is_concours {
        if pct_f < 50.0 {
            format!(
                r##"<a class="btn" href="#/eleve/{}">Revoir la fiche de cours</a>"##,
                esc_attr(&st.class_id)
            )
        } else {
            let ex_cls = if wrong_count == 0 { "btn primary" } else { "btn" };
            format!(
                r##"<a class="{ex_cls}" href="#/eleve/{}/exercices/{}">Passer aux exercices →</a>"##,
                esc_attr(&st.class_id),
                esc_attr(&st.chapter_id)
            )
        }
    } else {
        String::new()
    };

    format!(
        r##"<main class="page-main page-main--quiz" id="quiz">
          <div class="quiz-sheets">
            <section class="quiz-sheet">
              <div class="end">
                <div class="ring" style="--p:{pct_num}"><b>{pct_str}</b></div>
                <h2>{headline}</h2>
                <p>{score} / {total} bonnes réponses · Temps total : {dur}</p>
                <div class="row">
                  {retry_wrong_btn}
                  <button type="button" class="btn" data-action="quiz-retry">{ico_re} Recommencer</button>
                  {ex_link}
                  <a class="btn" href="{back_href}">{back_lbl}</a>
                </div>
                <div class="quiz-review">{review}</div>
              </div>
            </section>
          </div>
        </main>"##,
        pct_str = fmt_pct(pct_f),
        score = st.score,
        dur = fmt_time(st.total_elapsed),
        ico_re = icon("refresh", 15, ""),
        back_lbl = if st.is_concours { "Retour aux concours" } else { "Retour au programme" },
    )
}

#[cfg(test)]
mod quiz_media_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn renders_question_media_with_style_and_width() {
        let doc = json!({
            "title": "Mise à niveau",
            "questions": [{
                "type": "mcq",
                "prompt": "À la lecture de la courbe $C_f$...",
                "media": {
                    "src": "/data/2eme-bac-sc-math/mise-a-niveau/quiz/figures/qcm_lecture_graphique_limites_variations.svg",
                    "position": "bottom",
                    "width": "62%",
                    "alt": "Courbe Cf",
                    "caption": "Courbe représentative de $f$",
                    "style": { "border": true, "shadow": true, "rounded": true }
                },
                "options": ["A", "B"],
                "correctIndex": 0
            }]
        });
        let mut st = QuizState::default();
        st.init_from_doc("2eme-bac-sc-math", "mise-a-niveau", &doc, false, "", "");
        st.set_source_path("data/2eme-bac-sc-math/mise-a-niveau/quiz/mise-a-niveau_quiz.json");
        let html = render_quiz_view(&st, false, "");
        assert!(html.contains(r#"class="media-fig media-fig--quiz""#));
        assert!(html.contains("public/data/2eme-bac-sc-math/mise-a-niveau/quiz/figures/qcm_lecture_graphique_limites_variations.svg"));
        assert!(html.contains(r#"style="max-width:62%""#));
        assert!(html.contains("has-border"));
        assert!(html.contains("shadow-md"));
        assert!(html.contains("is-round"));
        assert!(html.contains("is-svg"));
        assert!(html.contains(r#"data-theme-icon="1""#));
    }

    #[test]
    fn grades_math_equivalence_detects_sign_error_and_retries_wrong_only() {
        let doc = json!({
            "title": "Analyse",
            "questions": [
                { "type": "input", "prompt": "Calculer $\\frac{1}{2}$", "answer": "\\frac{1}{2}", "hint": "Divisez 1 par 2." },
                { "type": "input", "prompt": "Calculer $3-5$", "answer": "-2" }
            ]
        });
        let mut st = QuizState::default();
        st.init_from_doc("2eme-bac-sc-math", "limites", &doc, false, "", "");
        // Question 1: French decimal 0,5 matches \frac{1}{2}
        st.input_value = "0,5".into();
        assert!(st.evaluate_current());
        assert!(st.last_feedback_hint.is_none());
        assert!(!st.advance());
        // Question 2: Opposite sign triggers pedagogical hint
        st.input_value = "2".into();
        assert!(!st.evaluate_current());
        assert_eq!(st.last_feedback_hint.as_deref(), Some("Attention au signe !"));
        assert!(st.advance());
        assert!(st.finished);
        // Results screen proposes targeted retry
        let res_html = render_quiz_view(&st, false, "");
        assert!(res_html.contains("Retravailler mes erreurs (1)"));
        // Retry wrong only keeps only Q2
        assert_eq!(st.retry_wrong_only(), 1);
        assert_eq!(st.questions.len(), 1);
        assert_eq!(st.questions[0]["answer"], json!("-2"));
        // Restart full restores both questions
        st.restart_full();
        assert_eq!(st.questions.len(), 2);
    }
}
