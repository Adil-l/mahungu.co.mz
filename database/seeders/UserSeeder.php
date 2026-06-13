<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $users = [
            [
                'name' => 'Admin Mahungu',
                'email' => 'admin@mahungu.co.mz',
                'phone' => '+258 84 000 0000',
                'is_admin' => true,
            ],
            [
                'name' => 'Adilson Gavumende',
                'email' => 'adilson.gavumende@mahungu.co.mz',
                'phone' => '+258 84 111 1111',
                'is_admin' => false,
            ],
            [
                'name' => 'Fátima Zaida',
                'email' => 'fatima.zaida@mahungu.co.mz',
                'phone' => '+258 84 222 2222',
                'is_admin' => false,
            ],
        ];

        foreach ($users as $data) {
            User::updateOrCreate(
                ['email' => $data['email']],
                [
                    'name' => $data['name'],
                    'phone' => $data['phone'],
                    'is_admin' => $data['is_admin'],
                    'password' => Hash::make('Mahungu@2026'),
                    'email_verified_at' => now(),
                    'theme' => 'dark',
                    'monitoring_interval' => 15,
                ]
            );
        }
    }
}
