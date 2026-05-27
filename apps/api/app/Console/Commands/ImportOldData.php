<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class ImportOldData extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'import:old-data';
    protected $description = 'Import data from old PostgreSQL database to the new database';

    public function handle()
    {
        $this->info('Starting data import from pgsql_old...');

        // Map of old table names to new table models/tables (if they changed)
        // In our case, the tables are quite similar.
        $tables = [
            'departments',
            'user' => 'users', // Old table was 'user' or 'users'? Let's check psql output: 'user' (singular), new is 'users'
            'courses',
            'cpls',
            'students',
            'course_cpl_mappings',
            'student_grades'
        ];

        // Disable foreign key checks for SQLite temporarily
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        foreach ($tables as $oldTable => $newTable) {
            if (is_numeric($oldTable)) {
                $oldTable = $newTable;
            }

            $this->info("Importing {$oldTable} to {$newTable}...");

            // Clear new table
            \Illuminate\Support\Facades\DB::table($newTable)->truncate();

            // Fetch old data
            $oldData = \Illuminate\Support\Facades\DB::connection('pgsql_old')->table($oldTable)->get();

            $insertData = [];
            foreach ($oldData as $row) {
                $rowArray = (array) $row;
                // Special mapping if needed
                if ($oldTable === 'user') {
                    // BetterAuth had different columns, map to Laravel Users
                    $newRow = [];
                    $newRow['id'] = $rowArray['id'];
                    $newRow['name'] = $rowArray['name'];
                    $newRow['email'] = $rowArray['email'];
                    $newRow['role'] = $rowArray['role'];
                    $newRow['department_id'] = $rowArray['department_id'];
                    $newRow['created_at'] = $rowArray['created_at'];
                    $newRow['updated_at'] = $rowArray['updated_at'];
                    // Default password since Better Auth stored it elsewhere or differently
                    $newRow['password'] = \Illuminate\Support\Facades\Hash::make('password');
                    
                    $rowArray = $newRow;
                }

                if ($oldTable === 'students') {
                    // Remove 'updated_at' if not in old table or add if needed, just copy existing
                    // Actually, let's just make sure we only insert matching columns.
                    // To be safe, we will just use $rowArray for others since they should match perfectly.
                }

                $insertData[] = $rowArray;
            }

            if (!empty($insertData)) {
                // Chunk insert to avoid memory issues
                foreach (array_chunk($insertData, 500) as $chunk) {
                    \Illuminate\Support\Facades\DB::table($newTable)->insert($chunk);
                }
            }
            $this->info("Inserted " . count($insertData) . " records into {$newTable}.");
        }

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
        $this->info('Data import completed successfully!');
    }
}
