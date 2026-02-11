import os
from datetime import datetime

def merge_markdown_files():
    # 基础目录
    base_dir = '/Users/tang/PycharmProjects/pythonProject/chajian/data'
    
    # 需要合并的文件列表
    files_to_merge = [
        '成长性sectionczxbj.md',
        '估值比较sectiongzbj.md',
        '杜邦分析sectiondbfxbj.md',
        '分红sectionfhrzgl.md'
    ]
    
    # 输出文件路径
    output_file = os.path.join(base_dir, '成长性_估值_杜邦分析_分红.md')
    
    merged_content = []
    # 添加一个总标题
    merged_content.append("# 财务报表综合分析报告\n")
    now_str = datetime.now().strftime('%Y/%m/%d %H:%M:%S')
    merged_content.append(f"> 合并时间: {now_str}\n\n---\n\n")

    for file_name in files_to_merge:
        file_path = os.path.join(base_dir, file_name)
        
        if not os.path.exists(file_path):
            print(f"警告: 文件 {file_name} 不存在，跳过。")
            continue
            
        print(f"正在处理: {file_name}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
            # 删除前 8 行（包括 # 表格数据导出、时间、来源、分隔符及后续空行）
            # lines[0]: # 表格数据导出
            # lines[1]: (empty)
            # lines[2]: > 导出时间...
            # lines[3]: (empty)
            # lines[4]: > 来源...
            # lines[5]: (empty)
            # lines[6]: ---
            # lines[7]: (empty)
            clean_lines = lines[8:] if len(lines) > 8 else []
            
            # 为每个部分添加一个二级标题，取自文件名（去除扩展名）
            section_title = file_name.replace('section', '_').replace('.md', '')
            merged_content.append(f"# {section_title}\n\n")
            merged_content.extend(clean_lines)
            merged_content.append("\n\n---\n\n") # 每个文件后添加分隔符

    # 写入合并后的文件
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(merged_content)
    

    print(f"合并完成！已生成文件: {output_file}")
    
    # 自动执行贝叶斯分析
    try:
        from analyze_report import analyze_report
        print("正在执行贝叶斯分析...")
        analyze_report(output_file)
    except ImportError:
        print("未找到 analyze_report.py，跳过分析步骤。")
    except Exception as e:
        print(f"分析过程中出错: {e}")

if __name__ == "__main__":
    merge_markdown_files()

