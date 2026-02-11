import re
import os
import sys

# Default Target (can be overridden)
DEFAULT_TARGET_CODE = '600519'
DEFAULT_TARGET_NAME = '贵州茅台'

# --- Bayesian Inference Engine ---
class BayesianAnalyzer:
    def __init__(self, initial_prior=0.10):
        """
        initial_prior: The base rate probability that any random stock is a "Quality Company".
                       Conservative start (e.g., 10%).
        """
        self.prior = initial_prior
        self.evidence_log = [] # To track why probability changed

    def update(self, evidence_name, evidence_value, p_evidence_given_quality, p_evidence_given_average):
        """
        Bayes' Theorem Update:
        P(Q|E) = P(E|Q) * P(Q) / P(E)
        P(E)   = P(E|Q)*P(Q) + P(E|~Q)*P(~Q)
        
        Args:
        - evidence_name: Description of the metric (e.g., "ROE > 20%")
        - evidence_value: The actual value (for logging)
        - p_evidence_given_quality (Likelihood Q): Probability a Quality Co has this trait.
        - p_evidence_given_average (Likelihood ~Q): Probability an Average Co has this trait.
        """
        # Calculate Normalizing Constant P(E)
        p_quality = self.prior
        p_average = 1 - p_quality
        
        p_evidence = (p_evidence_given_quality * p_quality) + (p_evidence_given_average * p_average)
        
        # Calculate Posterior P(Q|E)
        if p_evidence == 0: return # Avoid div by zero (shouldn't happen with reasonable likelihoods)
        
        posterior = (p_evidence_given_quality * p_quality) / p_evidence
        
        # Log the update
        change = posterior - self.prior
        impact = "Neutral"
        if change > 0.01: impact = "Positive"
        elif change < -0.01: impact = "Negative"
        
        self.evidence_log.append({
            "factor": evidence_name,
            "value": evidence_value,
            "prior": self.prior,
            "posterior": posterior,
            "impact": impact,
            "likelihood_ratio": p_evidence_given_quality / p_evidence_given_average if p_evidence_given_average > 0 else 999
        })
        
        self.prior = posterior # Update state
        return posterior

# --- Parsing Logic (Kept Robust) ---
def parse_markdown_table(markdown_content, section_name):
    section_pattern = r"# " + re.escape(section_name) + r"(.*?)(\n# |\Z)"
    match = re.search(section_pattern, markdown_content, re.DOTALL)
    if not match: return [], []
    
    lines = match.group(1).strip().split('\n')
    table_lines = [l for l in lines if l.strip().startswith('|')]
    if not table_lines: return [], []

    headers = [h.strip() for h in table_lines[0].split('|') if h.strip()]
    data = []
    for line in table_lines[1:]:
        if '---' in line: continue
        cells = [c.strip() for c in line.split('|')]
        if len(cells) > 2:
            if line.strip().startswith('|'): cells = cells[1:-1]
            data.append(cells)
    return data, headers

def extract_named_row(data, keyword_col_index, keyword):
    for row in data:
        if len(row) > keyword_col_index and keyword in row[keyword_col_index]: return row
    return None

def safe_float(val_str):
    if not val_str: return None
    try:
        val_str = val_str.strip()
        if val_str == '--': return None
        return float(val_str.replace('%', '').replace(',', ''))
    except: return None

def find_col_index(headers, keywords, exclude=None):
    for i, h in enumerate(headers):
        h_upper = h.upper()
        for k in keywords:
            if k.upper() in h_upper:
                if exclude and any(e.upper() in h_upper for e in exclude): continue
                return i
    return -1

def calculate_industry_median(rows, col_index):
    values = []
    for row in rows:
        if len(row) > 1 and row[1].isdigit() and len(row[1]) == 6:
            val = safe_float(row[col_index]) if col_index < len(row) else None
            if val is not None: values.append(val)
    if not values: return None
    values.sort()
    n = len(values)
    return (values[n//2 - 1] + values[n//2]) / 2 if n % 2 == 0 else values[n//2]

# --- Main Logic ---
def analyze_report(file_path, target_code=DEFAULT_TARGET_CODE, target_name=DEFAULT_TARGET_NAME):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Initialize Bayesian Engine (Base Rate = 10%)
    bayes = BayesianAnalyzer(initial_prior=0.10)
    metrics = {}
    
    # 1. Growth Inference
    rows, headers = parse_markdown_table(content, "成长性_czxbj")
    col_g3y = find_col_index(headers, ['3年复合', '基本每股收益']) 
    if col_g3y == -1 and len(headers) > 3: col_g3y = 3 
    
    target_row = extract_named_row(rows, 1, target_code)
    
    if target_row:
        g3y = safe_float(target_row[col_g3y])
        metrics['growth_3y'] = g3y
        
        if g3y is not None:
            if g3y > 15:
                # High Growth: Quality Co (80%), Average Co (20%)
                bayes.update("High Growth (>15%)", f"{g3y}%", 0.8, 0.2)
            elif g3y < 5:
                # Low Growth: Quality Co (10%), Average Co (60%)
                bayes.update("Low Growth (<5%)", f"{g3y}%", 0.1, 0.6)
            
            # Relative Growth
            ind_row = extract_named_row(rows, 0, '行业平均')
            if ind_row:
                ind_g3y = safe_float(ind_row[col_g3y])
                if ind_g3y is not None:
                    if g3y > ind_g3y:
                        # Outperformance: Quality (75%), Avg (30%)
                        bayes.update("Outperformed Industry", f"vs {ind_g3y}%", 0.75, 0.3)
    
    # 2. Quality/Profitability Inference (Strongest Signal)
    rows, headers = parse_markdown_table(content, "杜邦分析_dbfxbj")
    col_roe = find_col_index(headers, ['ROE', '净资产收益率']) or 3
    target_row = extract_named_row(rows, 1, target_code)
    
    if target_row:
        roe = safe_float(target_row[col_roe])
        metrics['roe'] = roe
        
        if roe is not None:
            if roe > 25:
                # Exceptional ROE: Very strong indicator of Moat
                # Quality (90%), Average (5%) -> Huge Likelihood Ratio
                bayes.update("Exceptional ROE (>25%)", f"{roe}%", 0.9, 0.05)
            elif roe > 15:
                bayes.update("Strong ROE (>15%)", f"{roe}%", 0.7, 0.2)
            elif roe < 8:
                bayes.update("Weak ROE (<8%)", f"{roe}%", 0.05, 0.5)

    # 3. Valuation (Safety Check) - This affects 'Buy Probability', not 'Quality Probability' directly
    # But for this report we treat "Good Investment" as Quality + Value.
    # Let's assess Quality first, then separately assessing "Attractiveness".
    # Actually, let's keep it simple: "Probability this is a Strong Buy".
    
    rows, headers = parse_markdown_table(content, "估值比较_gzbj")
    col_pe = find_col_index(headers, ['市盈率', 'PE'], exclude=['PEG']) or 4
    col_peg = find_col_index(headers, ['PEG']) or 3
    
    target_row = extract_named_row(rows, 1, target_code)
    if target_row:
        pe = safe_float(target_row[col_pe])
        peg = safe_float(target_row[col_peg])
        ind_median_pe = calculate_industry_median(rows, col_pe)
        
        metrics['pe'] = pe
        metrics['ind_median_pe'] = ind_median_pe
        
        # Valuation Context:
        # If PE is low relative to Industry, it increases "Attractiveness" probability.
        if pe is not None and ind_median_pe is not None and ind_median_pe > 0:
            rel_val = pe / ind_median_pe
            if rel_val < 0.8:
                bayes.update("Undervalued vs Industry", f"PE {pe} vs {ind_median_pe}", 0.7, 0.3)
            elif rel_val > 1.5:
                bayes.update("Overvalued vs Industry", f"PE {pe} vs {ind_median_pe}", 0.2, 0.6)
        
        # PEG Logic
        if peg is not None:
            if 0 < peg < 1:
                bayes.update("Undervalued Growth (PEG<1)", f"{peg}", 0.7, 0.3)

    # 4. Dividend & Risks
    rows, headers = parse_markdown_table(content, "分红_fhrzgl")
    if rows:
        col_yield = find_col_index(headers, ['股息率']) or 0
        div_yield = safe_float(rows[0][col_yield])
        metrics['div_yield'] = div_yield
        
        if div_yield is not None:
            if div_yield > 3.0:
                bayes.update("High Dividend Yield", f"{div_yield}%", 0.6, 0.3)
                
                # Value Trap Check (Determinstic Penalty)
                # If Yield is High but Growth is Neg, it's a strong signal of Value Trap (Not Quality)
                g3y = metrics.get('growth_3y')
                if g3y is not None and g3y < 0:
                    # Trait: High Yield + Neg Growth
                    # Quality (1%), Average/Trap (40%)
                    bayes.update("Value Trap Warning", "Yield >3% & Neg Growth", 0.01, 0.40)

    # Generate Report
    generate_markdown_report(target_code, target_name, bayes, metrics)

def generate_markdown_report(code, name, bayes, metrics):
    final_prob = bayes.prior * 100
    
    lines = []
    lines.append(f"# 贝叶斯算法深度分析: {name} ({code})\n")
    lines.append(f"> **优质标的置信度 (Confidence of Quality): {final_prob:.1f}%**\n\n")
    
    # 1. Conclusion
    action = "观望 (Hold)"
    if final_prob > 90: action = "强力买入 (Strong Buy)"
    elif final_prob > 75: action = "买入 (Buy)"
    elif final_prob < 30: action = "卖出 (Sell)"
    
    lines.append(f"## 核心结论: {action}\n\n")
    
    # 2. Logic Trace (The "Why")
    lines.append("## 贝叶斯推理路径 (Bayesian Inference Trace)\n")
    lines.append("| 证据因子 (Evidence) | 数值 | 似然比 (L-Ratio) | 概率变动 (Prob Change) |\n")
    lines.append("| --- | --- | --- | --- |\n")
    lines.append(f"| **初始先验 (Base Rate)** | 市场基准 | - | 10.0% |\n")
    
    for log in bayes.evidence_log:
        direction = "🔺" if log['impact'] == "Positive" else "🔻"
        if log['impact'] == "Neutral": direction = "🔸"
        lines.append(f"| {log['factor']} | {log['value']} | {log['likelihood_ratio']:.1f}x | {log['prior']*100:.1f}% -> **{log['posterior']*100:.1f}%** {direction} |\n")
    
    # 3. Investment Advice
    lines.append("\n## 投资建议 (Investment View)\n")
    pe = metrics.get('pe', 'N/A')
    ind_pe = metrics.get('ind_median_pe', 'N/A')
    
    lines.append(f"- **估值**: PE {pe} (行业中值 {ind_pe})\n")
    if final_prob > 90:
        lines.append(f"- **逻辑**: 极高的置信度 ({final_prob:.1f}%) 表明该标的具有罕见的优质特征组合（高ROE+高增长+合理估值）。\n")
    
    lines.append("\n---\n> **免责声明**: 概率仅代表历史数据特征的匹配度，不代表未来收益承诺。\n")

    out_path = '/Users/tang/PycharmProjects/pythonProject/chajian/data/beiyesi_out.md'
    with open(out_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print(f"Bayesian Analysis Complete: {out_path}")

if __name__ == "__main__":
    report_path = '/Users/tang/PycharmProjects/pythonProject/chajian/data/merged_report.md'
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        analyze_report(report_path, target_code=sys.argv[1])
    elif os.path.exists(report_path):
        analyze_report(report_path)
