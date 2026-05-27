import re

def convert():
    with open('cpl_pnb_export_temp.sql', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    with open('cpl_pnb_cpanel.sql', 'w', encoding='utf-8') as out:
        out.write("SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';\n")
        out.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")
        
        for line in lines:
            if line.startswith('PRAGMA') or 'sqlite_sequence' in line:
                continue
            if line.startswith('BEGIN TRANSACTION') or line.startswith('COMMIT'):
                continue
                
            line = re.sub(r'"([a-zA-Z0-9_]+)"', r'`\1`', line)
            line = line.replace('autoincrement', 'AUTO_INCREMENT')
            line = re.sub(r'\bvarchar\b(?!\s*\()', 'varchar(255)', line, flags=re.IGNORECASE)
            
            # Specifically handle this role check constraint
            line = line.replace("check (`role` in ('super_admin', 'admin_jurusan', 'user'))", "")
            # Also handle any other generic check constraints by matching non-greedy
            line = re.sub(r'check\s*\([^)]*\)\)*', '', line, flags=re.IGNORECASE)
            # Remove any double spaces
            line = line.replace('  ', ' ')
            
            out.write(line)
            
        out.write("\nSET FOREIGN_KEY_CHECKS = 1;\n")

if __name__ == '__main__':
    convert()
