import { useState } from 'react';
import { getKValue } from '../lib/ie';

type Formula = {
  id: string;
  title: string;
  formula: string;
  description: string;
  variables: [string, string][];
  usedIn: string;
};

const FORMULAS: Formula[] = [
  {
    id: 'normal-time',
    title: 'เวลาปกติ (Normal Time)',
    formula: 'NT = OT × (R ÷ 100)',
    description:
      'ปรับเวลาที่จับได้ให้เป็นเวลาของพนักงานที่ทำงานด้วยจังหวะปกติ โดยใช้การประเมินอัตราความเร็ว (Performance Rating)',
    variables: [
      ['OT', 'เวลาที่จับได้ (Observed Time)'],
      ['R', 'Performance Rating (%) — 100 = จังหวะปกติ, มากกว่า 100 = เร็วกว่าปกติ'],
    ],
    usedIn: 'Standard Time ในตารางรายการ Study',
  },
  {
    id: 'standard-time',
    title: 'เวลามาตรฐาน (Standard Time)',
    formula: 'ST = NT × (1 + A ÷ 100)',
    description:
      'เวลาที่พนักงานที่มีทักษะเหมาะสมใช้ทำงานหนึ่งรอบ รวมเวลาเผื่อสำหรับความต้องการส่วนตัว ความเหนื่อยล้า และความล่าช้า (PF&D)',
    variables: [
      ['NT', 'เวลาปกติ'],
      ['A', 'เวลาเผื่อ (Allowance %) — ILO แนะนำค่าพื้นฐาน: ส่วนตัว 5% + ความเหนื่อยล้า 4%'],
    ],
    usedIn: 'KPI "Standard Time เฉลี่ย"',
  },
  {
    id: 'efficiency',
    title: 'ประสิทธิภาพ (Efficiency)',
    formula: 'E = (ST ÷ AT) × 100',
    description: 'เทียบเวลามาตรฐานกับเวลาที่ใช้จริง ค่ามากกว่า 100% แปลว่าทำได้เร็วกว่ามาตรฐาน',
    variables: [
      ['ST', 'เวลามาตรฐาน'],
      ['AT', 'เวลาที่ใช้จริง (Actual Time)'],
    ],
    usedIn: 'KPI "ประสิทธิภาพเฉลี่ย"',
  },
  {
    id: 'man-hour',
    title: 'ชั่วโมงแรงงานต่อหน่วย (Man-hour per Unit)',
    formula: 'MH = (T ÷ 3600) × W ÷ Q',
    description: 'จำนวนชั่วโมงแรงงานที่ใช้ผลิตสินค้าหนึ่งชิ้น ใช้ประเมินต้นทุนแรงงานและวางแผนกำลังคน',
    variables: [
      ['T', 'เวลารวมต่อรอบ (วินาที)'],
      ['W', 'จำนวนพนักงาน (ระบบนี้คิดเป็น 1 คนต่อ Study)'],
      ['Q', 'จำนวนชิ้นที่ผลิตได้ในรอบนั้น'],
    ],
    usedIn: 'KPI "Man-hour ต่อหน่วย"',
  },
  {
    id: 'sample-size',
    title: 'จำนวนรอบที่ต้องจับเวลา (Sample Size)',
    formula: 'N = ((k × s) ÷ (h × x̄))²',
    description:
      'จำนวนรอบขั้นต่ำที่ทำให้ค่าเฉลี่ยที่ได้คลาดเคลื่อนไม่เกินที่กำหนด ที่ระดับความเชื่อมั่นที่เลือก',
    variables: [
      ['k', 'ค่าจากการแจกแจงปกติ: 90% = 1.645, 95% = 1.96, 99% = 2.576'],
      ['s', 'ส่วนเบี่ยงเบนมาตรฐานของเวลาที่จับได้'],
      ['h', 'ค่าคลาดเคลื่อนที่ยอมรับ (เช่น 0.05 = 5%)'],
      ['x̄', 'ค่าเฉลี่ยของเวลาที่จับได้'],
    ],
    usedIn: 'การ์ด "จำนวนรอบที่ต้องจับเพิ่ม"',
  },
  {
    id: 'line-balance',
    title: 'ประสิทธิภาพการจัดสมดุลสายการผลิต (Line Balancing)',
    formula: 'LE = Σtᵢ ÷ (n × tₘₐₓ) × 100',
    description:
      'ขั้นตอนที่ใช้เวลานานที่สุดคือคอขวด (Bottleneck) ซึ่งกำหนดรอบเวลาของทั้งสาย ส่วนที่ขาดจาก 100% คือ Balance Delay',
    variables: [
      ['tᵢ', 'เวลาเฉลี่ยของแต่ละขั้นตอน'],
      ['n', 'จำนวนขั้นตอน (สถานีงาน)'],
      ['tₘₐₓ', 'เวลาของขั้นตอนที่นานที่สุด (คอขวด)'],
    ],
    usedIn: 'หน้า "การคำนวณ"',
  },
  {
    id: 'takt-time',
    title: 'Takt Time',
    formula: 'Takt = T ÷ D',
    description:
      'จังหวะการผลิตที่ต้องทำให้ได้เพื่อให้ทันความต้องการของลูกค้า ทุกสถานีต้องใช้เวลาไม่เกิน Takt Time',
    variables: [
      ['T', 'เวลาทำงานที่ใช้ได้จริงต่อกะ (วินาที)'],
      ['D', 'ความต้องการ — จำนวนชิ้นที่ต้องผลิตต่อกะ'],
    ],
    usedIn: 'หน้า "การคำนวณ"',
  },
];

const STUDY_STEPS = [
  ['เลือกงานที่จะศึกษา', 'งานที่เป็นคอขวด มีต้นทุนสูง หรือทำซ้ำบ่อย'],
  ['แบ่งงานเป็นขั้นตอนย่อย (Element)', 'แต่ละขั้นตอนต้องมีจุดเริ่มและจุดจบที่ชัดเจน'],
  ['จับเวลาหลายรอบ', 'บันทึกเวลาของแต่ละขั้นตอนในทุกรอบ'],
  ['ประเมิน Performance Rating', 'เทียบจังหวะของพนักงานกับจังหวะปกติ'],
  ['ตรวจจำนวนรอบให้เพียงพอ', 'ใช้สูตร Sample Size ถ้ายังไม่พอให้จับเพิ่ม'],
  ['คำนวณ Normal Time และ Standard Time', 'บวกเวลาเผื่อตามสภาพงาน'],
  ['วิเคราะห์และปรับปรุง', 'หาคอขวด แล้วใช้หลัก ECRS ปรับปรุงวิธีทำงาน'],
];

const ECRS = [
  ['E', 'Eliminate — กำจัด', 'ตัดขั้นตอนที่ไม่เพิ่มคุณค่าออก เช่น การรอ การขนย้ายซ้ำ การตรวจซ้ำซ้อน'],
  ['C', 'Combine — รวม', 'รวมขั้นตอนที่ทำต่อเนื่องกันให้ทำพร้อมกัน เช่น ตรวจสอบระหว่างประกอบ'],
  ['R', 'Rearrange — จัดลำดับใหม่', 'สลับลำดับงานหรือย้ายตำแหน่งวัสดุให้ระยะเคลื่อนที่สั้นลง'],
  ['S', 'Simplify — ทำให้ง่าย', 'ใช้อุปกรณ์จับยึด (Jig/Fixture) หรือออกแบบชิ้นงานให้ประกอบง่ายขึ้น'],
];

const THERBLIGS: [string, string, boolean][] = [
  ['Transport Empty (TE)', 'เอื้อมมือเปล่า', true],
  ['Grasp (G)', 'จับ', true],
  ['Transport Loaded (TL)', 'เคลื่อนย้ายของ', true],
  ['Release Load (RL)', 'ปล่อย', true],
  ['Pre-position (PP)', 'จัดตำแหน่งล่วงหน้า', true],
  ['Use (U)', 'ใช้เครื่องมือ', true],
  ['Assemble (A)', 'ประกอบ', true],
  ['Disassemble (DA)', 'ถอด', true],
  ['Search (Sh)', 'ค้นหา', false],
  ['Select (St)', 'เลือก', false],
  ['Position (P)', 'จัดตำแหน่ง', false],
  ['Hold (H)', 'ถือค้างไว้', false],
  ['Inspect (I)', 'ตรวจสอบ', false],
  ['Plan (Pn)', 'วางแผน / คิด', false],
  ['Unavoidable Delay (UD)', 'ล่าช้าที่หลีกเลี่ยงไม่ได้', false],
  ['Avoidable Delay (AD)', 'ล่าช้าที่หลีกเลี่ยงได้', false],
  ['Rest (R)', 'พักเพื่อลดความเหนื่อยล้า', false],
];

const MOTION_ECONOMY = [
  {
    title: 'การใช้ร่างกาย',
    items: [
      'ใช้มือทั้งสองข้างเริ่มและจบการเคลื่อนไหวพร้อมกัน',
      'มือทั้งสองไม่ควรว่างพร้อมกัน ยกเว้นช่วงพัก',
      'เคลื่อนไหวแขนในทิศสมมาตรและตรงกันข้ามกัน',
      'ใช้การเคลื่อนไหวที่ต่อเนื่องเป็นเส้นโค้ง แทนการหักมุม',
    ],
  },
  {
    title: 'การจัดสถานที่ทำงาน',
    items: [
      'วางวัสดุและเครื่องมือไว้ในตำแหน่งที่แน่นอน',
      'วางของให้อยู่ในระยะเอื้อมปกติ ใกล้จุดใช้งาน',
      'ใช้แรงโน้มถ่วงช่วยส่งวัสดุ เช่น รางเลื่อน',
      'ให้แสงสว่างและความสูงของโต๊ะเหมาะกับงาน',
    ],
  },
  {
    title: 'การออกแบบเครื่องมือ',
    items: [
      'ใช้ Jig หรือ Fixture แทนการถือชิ้นงานด้วยมือ',
      'รวมเครื่องมือสองชนิดเข้าด้วยกันเมื่อทำได้',
      'จัดวางเครื่องมือล่วงหน้าให้พร้อมหยิบใช้',
      'ออกแบบด้ามจับให้จับถนัดและลดความเมื่อยล้า',
    ],
  },
];

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '-');

function StandardTimeCalculator() {
  const [observed, setObserved] = useState(30);
  const [rating, setRating] = useState(100);
  const [allowance, setAllowance] = useState(10);

  const normal = observed * (rating / 100);
  const standard = normal * (1 + allowance / 100);
  const perHour = standard > 0 ? 3600 / standard : 0;

  return (
    <div className="card calc-card">
      <h2>เครื่องคำนวณ Standard Time</h2>
      <div className="calc-inputs">
        <label>
          เวลาที่จับได้ (วินาที)
          <input type="number" min={0} step={0.1} value={observed} onChange={(e) => setObserved(Number(e.target.value))} />
        </label>
        <label>
          Performance Rating (%)
          <input type="number" min={0} step={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
        </label>
        <label>
          เวลาเผื่อ (%)
          <input type="number" min={0} step={1} value={allowance} onChange={(e) => setAllowance(Number(e.target.value))} />
        </label>
      </div>
      <div className="calc-results">
        <div className="stat-item">
          <span className="stat-label">เวลาปกติ</span>
          <span className="stat-value">{fmt(normal)} s</span>
        </div>
        <div className="stat-item highlight">
          <span className="stat-label">เวลามาตรฐาน</span>
          <span className="stat-value">{fmt(standard)} s</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">กำลังการผลิต</span>
          <span className="stat-value">{fmt(perHour, 1)} ชิ้น/ชม.</span>
        </div>
      </div>
    </div>
  );
}

function SampleSizeCalculator() {
  const [avg, setAvg] = useState(30);
  const [sd, setSd] = useState(3);
  const [confidence, setConfidence] = useState(95);
  const [error, setError] = useState(5);

  const k = getKValue(confidence);
  const n = avg > 0 && error > 0 ? Math.ceil(((k * sd) / ((error / 100) * avg)) ** 2) : 0;

  return (
    <div className="card calc-card">
      <h2>เครื่องคำนวณจำนวนรอบที่ต้องจับ</h2>
      <div className="calc-inputs">
        <label>
          ค่าเฉลี่ย x̄ (วินาที)
          <input type="number" min={0} step={0.1} value={avg} onChange={(e) => setAvg(Number(e.target.value))} />
        </label>
        <label>
          ส่วนเบี่ยงเบนมาตรฐาน s
          <input type="number" min={0} step={0.1} value={sd} onChange={(e) => setSd(Number(e.target.value))} />
        </label>
        <label>
          ความเชื่อมั่น
          <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>
            <option value={90}>90%</option>
            <option value={95}>95%</option>
            <option value={99}>99%</option>
          </select>
        </label>
        <label>
          ค่าคลาดเคลื่อน (%)
          <input type="number" min={1} step={1} value={error} onChange={(e) => setError(Number(e.target.value))} />
        </label>
      </div>
      <div className="calc-results">
        <div className="stat-item">
          <span className="stat-label">ค่า k</span>
          <span className="stat-value">{k}</span>
        </div>
        <div className="stat-item highlight">
          <span className="stat-label">จำนวนรอบขั้นต่ำ</span>
          <span className="stat-value">{n} รอบ</span>
        </div>
      </div>
    </div>
  );
}

export default function LearnPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>การศึกษา</h1>
          <p className="page-subtitle">หลัก Industrial Engineering ที่ใช้ในระบบ Motion &amp; Time Study</p>
        </div>
      </div>

      <nav className="toc" aria-label="สารบัญ">
        <a href="#intro">ภาพรวม</a>
        <a href="#steps">ขั้นตอนการศึกษาเวลา</a>
        <a href="#formulas">สูตรที่ใช้</a>
        <a href="#calculators">เครื่องคำนวณ</a>
        <a href="#therbligs">Therbligs</a>
        <a href="#ecrs">ECRS</a>
        <a href="#motion-economy">หลักการเคลื่อนไหวอย่างประหยัด</a>
      </nav>

      <section id="intro" className="card">
        <h2>Motion &amp; Time Study คืออะไร</h2>
        <div className="two-col">
          <div>
            <h3>การศึกษาการเคลื่อนไหว (Motion Study)</h3>
            <p>
              วิเคราะห์ท่าทางและลำดับการเคลื่อนไหวของพนักงาน เพื่อตัดการเคลื่อนไหวที่ไม่จำเป็นออก
              และหาวิธีทำงานที่ดีที่สุด พัฒนาโดย Frank และ Lillian Gilbreth
            </p>
          </div>
          <div>
            <h3>การศึกษาเวลา (Time Study)</h3>
            <p>
              จับเวลาการทำงานจริงเพื่อกำหนดเวลามาตรฐาน ใช้วางแผนการผลิต คำนวณต้นทุน
              และประเมินประสิทธิภาพ พัฒนาโดย Frederick W. Taylor
            </p>
          </div>
        </div>
      </section>

      <section id="steps" className="card">
        <h2>ขั้นตอนการศึกษาเวลา</h2>
        <ol className="step-list">
          {STUDY_STEPS.map(([title, detail]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <h2 id="formulas" className="section-title">สูตรที่ใช้ในระบบ</h2>
      <div className="formula-grid">
        {FORMULAS.map((f) => (
          <section key={f.id} className="card formula-card">
            <h2>{f.title}</h2>
            <div className="formula">{f.formula}</div>
            <p>{f.description}</p>
            <dl className="var-list">
              {f.variables.map(([symbol, meaning]) => (
                <div key={symbol}>
                  <dt>{symbol}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
            <span className="used-in">ใช้ใน: {f.usedIn}</span>
          </section>
        ))}
      </div>

      <h2 id="calculators" className="section-title">เครื่องคำนวณ</h2>
      <div className="formula-grid">
        <StandardTimeCalculator />
        <SampleSizeCalculator />
      </div>

      <section id="therbligs" className="card">
        <h2>Therbligs — การเคลื่อนไหวพื้นฐาน 17 แบบ</h2>
        <p className="card-intro">
          Gilbreth แบ่งการทำงานด้วยมือออกเป็นการเคลื่อนไหวพื้นฐาน กลุ่มที่ไม่ก่อให้เกิดงาน
          (Ineffective) คือเป้าหมายแรกที่ควรลดหรือกำจัด
        </p>
        <div className="therblig-cols">
          {[true, false].map((effective) => (
            <div key={String(effective)}>
              <h3>
                <span className={`badge ${effective ? 'badge-good' : 'badge-warn'}`}>
                  {effective ? 'ก่อให้เกิดงาน (Effective)' : 'ไม่ก่อให้เกิดงาน (Ineffective)'}
                </span>
              </h3>
              <ul className="therblig-list">
                {THERBLIGS.filter(([, , e]) => e === effective).map(([en, th]) => (
                  <li key={en}>
                    <span>{th}</span>
                    <span className="muted">{en}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="ecrs" className="card">
        <h2>หลัก ECRS — แนวทางปรับปรุงงาน</h2>
        <div className="ecrs-grid">
          {ECRS.map(([letter, name, detail]) => (
            <div key={letter} className="ecrs-item">
              <span className="ecrs-letter">{letter}</span>
              <div>
                <strong>{name}</strong>
                <p>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="motion-economy" className="card">
        <h2>หลักการเคลื่อนไหวอย่างประหยัด (Principles of Motion Economy)</h2>
        <div className="three-col">
          {MOTION_ECONOMY.map((group) => (
            <div key={group.title}>
              <h3>{group.title}</h3>
              <ul className="plain-list">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
